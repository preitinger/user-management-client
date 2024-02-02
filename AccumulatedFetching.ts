import { apiFetchPost } from "./apiRoutesClient";
import { AccumulatedReq, AccumulatedResp, ApiResp } from "./user-management-common/apiRoutesCommon";

export interface AccumulatedFetchingHandler {
    fetchError: (error: string) => void;
}

export class AccumulatedFetching {
    constructor(url: string, handler: AccumulatedFetchingHandler) {
        this.url = url;
        this.handler = handler;
        this.fetchLoop();
    }

    setInterrupted(interrupted: boolean) {
        this.interrupted = interrupted;
        this.wakeUpLoopEventually();
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
            this.wakeUpLoopEventually();
            // if (!this.interrupted && this.resolveQueueNotEmptyAndNotInterrupted != null) {
            //     this.resolveQueueNotEmptyAndNotInterrupted();
            //     this.resolveQueueNotEmptyAndNotInterrupted = null;
            // }

        })
    }

    private mustWait(): boolean {
        console.log('mustWait: inQueue.length', this.inQueue.length, 'outQueue.length', this.outQueue.length, 'interrupted', this.interrupted);
        return (this.inQueue.length === 0 && this.outQueue.length === 0) || this.interrupted;
    }

    private wakeUpLoopEventually() {
        if (this.resolveQueueNotEmptyAndNotInterrupted && !this.mustWait()) {
            this.resolveQueueNotEmptyAndNotInterrupted();
        }
    }

    private async fetchLoop() {
        while (true) {
            if (this.mustWait()) {
                await new Promise<void>((resolve) => {
                    this.resolveQueueNotEmptyAndNotInterrupted = resolve;
                });
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
                const resp = await apiFetchPost<AccumulatedReq, AccumulatedResp>(this.url, req);
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
                    this.handler.fetchError('Caught unknown in apiFetchPost: ' + JSON.stringify(reason));
                }
            }

        }
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
}


type PromiseExecuter = {
    resolve: (value: any | PromiseLike<any>) => void;
    reject: (reason?: any) => void;
}

type RequestTask = {
    req: { type: string };
    executer: PromiseExecuter;
}
