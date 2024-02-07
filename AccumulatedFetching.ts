import { apiFetchPost } from "./apiRoutesClient";
import { AccumulatedReq, AccumulatedResp, ApiResp } from "./user-management-common/apiRoutesCommon";

export interface AccumulatedFetchingHandler {
    fetchError: (error: string) => void;
}

export type AccumulatedFetchingLoopState = 'waiting' | 'fetching' | 'closed';

export class AccumulatedFetching {
    constructor(url: string, handler: AccumulatedFetchingHandler) {
        this.url = url;
        this.handler = handler;
        this.abortController = new AbortController();
        this.fetchLoop();
    }

    getState(): AccumulatedFetchingLoopState {
        return this.state;
    }

    isInterrupted() {
        return this.interrupted;
    }

    setInterrupted(interrupted: boolean) {
        this.interrupted = interrupted;
        this.wakeUpLoopMaybe();
    }

    push<Req extends { type: string }, Resp>(req: Req): Promise<ApiResp<Resp>> {
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

    close() {
        this.abortController.abort();
        this.closing = true;
        this.wakeUpLoopMaybe();
    }

    isClosing() {
        return this.closing;
    }

    private mustWait(): boolean {
        console.log('mustWait: inQueue.length', this.inQueue.length, 'outQueue.length', this.outQueue.length, 'interrupted', this.interrupted);
        return !this.closing && ((this.inQueue.length === 0 && this.outQueue.length === 0) || this.interrupted);
    }

    private wakeUpLoopMaybe() {
        if (this.resolveQueueNotEmptyAndNotInterrupted && !this.mustWait()) {
            this.resolveQueueNotEmptyAndNotInterrupted();
        }
    }

    private async fetchLoop() {
        while (!this.closing) {
            if (this.mustWait()) {
                this.state = 'waiting';
                await new Promise<void>((resolve) => {
                    this.resolveQueueNotEmptyAndNotInterrupted = resolve;
                });
                if (this.closing) continue;
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
                this.interrupted = true;
                if (reason instanceof Error) {
                    if (reason.message === 'Failed to fetch') {
                        this.handler.fetchError('No connection to the server.');
                    } else {
                        this.handler.fetchError(`Unknown server error(${reason.name}): ${reason.message}`);
                    }
                } else {
                    console.warn('Caught unknown in apiFetchPost', reason);
                    this.handler.fetchError('Caught unknown in apiFetchPost: ' + JSON.stringify(reason));
                }
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
    private closing: boolean = false;
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
