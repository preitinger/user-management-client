import FixedAbortController from "../pr-client-utils/FixedAbortController";
import { myAddEventListener } from "../pr-client-utils/eventListeners";
import { apiFetchPost } from "./apiRoutesClient";
import { AccumulatedReq, AccumulatedResp, ApiResp } from "./user-management-common/apiRoutesCommon";

export interface AccumulatedFetchingHandler {
    fetchError: (error: string) => void;
}

export type AccumulatedFetchingLoopState = 'waiting' | 'fetching' | 'closed';

export class AccumulatedFetching {
    constructor(url: string, handler: AccumulatedFetchingHandler, abortController?: AbortController) {
        this.url = url;
        this.handler = handler;
        this.abortController = abortController ?? new FixedAbortController();
        const abortListener = () => {
            this.wakeUpLoopMaybe();
            this.inQueue.forEach(task => {
                task.executer.reject(new DOMException('Fetch task aborted because abort signal of AccumulatedFetching was aborted', 'AbortError'));
            })
            this.abortController.signal.removeEventListener('abort', abortListener);
        }
        this.abortController.signal.addEventListener('abort', abortListener, {
            once: true
        });

        this.fetchLoop();
    }

    getState(): AccumulatedFetchingLoopState {
        return this.state;
    }

    isInterrupted() {
        this.abortController.signal.throwIfAborted();
        return this.interrupted;
    }

    /**
     * interrupt or continue the processing of the fetches.
     * @param interrupted 
     */
    setInterrupted(interrupted: boolean) {
        this.abortController.signal.throwIfAborted();
        this.interrupted = interrupted;
        this.wakeUpLoopMaybe();
    }

    pushRaw<Req extends { type: string }, Resp>(req: Req): Promise<ApiResp<Resp>> {
        this.abortController.signal.throwIfAborted();
        return new Promise<ApiResp<Resp>>((resolve, reject) => {
            const task = {
                req: req,
                executer: {
                    resolve: resolve,
                    reject: reject
                }
            };
            this.inQueue.push(task);
            this.wakeUpLoopMaybe();
        })
    }

    push<Req extends { type: string }, Resp>(req: Req, signal: AbortSignal): Promise<ApiResp<Resp>> {
        // let abortListener: () => void;
        let tidyUp: (() => void) | null = null;
        const abortProm = new Promise<ApiResp<Resp>>((res, rej) => {
            tidyUp = myAddEventListener(signal, 'abort', () => {
                rej(signal.reason);
            }, {
                once: true
            })
        })
        return Promise.race([abortProm, this.pushRaw<Req, Resp>(req)]).finally(() => {
            if (tidyUp == null) throw new Error('tidyUp null');
            tidyUp()
        })
    }

    close() {
        console.log('close: will abort abortController');
        this.abortController.abort();
    }

    isClosing() {
        return this.abortController.signal.aborted;
    }

    private mustWait(): boolean {
        // console.log('mustWait: inQueue.length', this.inQueue.length, 'outQueue.length', this.outQueue.length, 'interrupted', this.interrupted);
        return !this.isClosing() && ((this.inQueue.length === 0 && this.outQueue.length === 0) || this.interrupted);
    }

    private wakeUpLoopMaybe() {
        if (this.resolveQueueNotEmptyAndNotInterrupted && !this.mustWait()) {
            this.resolveQueueNotEmptyAndNotInterrupted();
        }
    }

    private async fetchLoop() {
        try {
            while (!this.isClosing()) {
                if (this.mustWait()) {
                    this.state = 'waiting';
                    await new Promise<void>((resolve) => {
                        this.resolveQueueNotEmptyAndNotInterrupted = resolve;
                    });
                    if (this.isClosing()) continue;
                }
                if (this.mustWait()) {
                    throw new Error('queues empty or interrupted after await');
                }

                if (this.outQueue.length === 0) {
                    this.swapQueues();
                }

                const req: AccumulatedReq = {
                    type: 'AccumulatedReq',
                    requests: this.outQueue.map(x => x.req)
                }
                try {
                    this.state = 'fetching';
                    const resp = await apiFetchPost<AccumulatedReq, AccumulatedResp>(this.url, req, this.abortController.signal);
                    switch (resp.type) {
                        case 'success': {
                            if (resp.responses.length !== this.outQueue.length) {
                                throw new Error(`Illegal state: resp.responses.length=${resp.responses.length} !== ${this.outQueue.length} = this.beingSent.length`);
                            }
                            for (let i = 0; i < resp.responses.length; ++i) {
                                this.outQueue[i].executer.resolve(resp.responses[i]);
                            }

                            this.outQueue.length = 0;
                            this.swapQueues();
                            break;
                        }
                        case 'error': {
                            this.interrupted = true;
                            this.handler.fetchError(resp.error);
                            break;
                        }
                        default:
                            throw new Error('Unexpected response: ' + JSON.stringify(resp));
                    }
                } catch (reason) {
                    console.log('caught silently', reason);
                    this.abortController.signal.throwIfAborted();
                    this.interrupted = true;
                    if (reason instanceof Error) {
                        if (reason.message === 'Failed to fetch') {
                            this.handler.fetchError('No internet connection.');
                        } else {
                            this.handler.fetchError(`Unknown server error(${reason.name}): ${reason.message}`);
                        }
                    } else {
                        console.warn('Caught unknown in apiFetchPost', reason);
                        this.handler.fetchError('Caught unknown in apiFetchPost: ' + JSON.stringify(reason));
                    }
                }

            }

        } catch (reason: any) {
            console.log('catch in fetch loop');
            if (reason.name !== 'AbortError') {
                console.error(reason);
            }
        }

        this.state = 'closed';
    }

    private swapQueues() {
        const tmp = this.inQueue;
        this.inQueue = this.outQueue;
        this.outQueue = tmp;
    }

    private url: string;
    private handler: AccumulatedFetchingHandler;
    private interrupted: boolean = false;
    private inQueue: RequestTask[] = [];
    private outQueue: RequestTask[] = [];
    private resolveQueueNotEmptyAndNotInterrupted: null | ((value: void | PromiseLike<void>) => void) = null;
    private abortController: AbortController;
    private state: AccumulatedFetchingLoopState = 'waiting';
}


type PromiseExecuter = {
    resolve: (value: any | PromiseLike<any>) => void;
    reject: (reason?: any) => void;
}

type RequestTask = {
    req: { type: string };
    executer: PromiseExecuter;
}
