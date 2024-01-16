import { AccumulatedReq, AccumulatedResp, ApiResp } from "./user-management-common/apiRoutesCommon";

export async function apiFetchPost<MyReq, MySuccessResp>(
    url: string,
    req: MyReq,
    signal?: AbortSignal
): Promise<ApiResp<MySuccessResp>> {
    return await fetch(url, {
        headers: { "Content-Type": "application/json" },
        method: 'POST',
        body: JSON.stringify(req),
        signal: signal
    }).then(resp => resp.json());
}

type PromiseExecuter = {
    resolve: (value: any | PromiseLike<any>) => void;
    reject: (reason?: any) => void;
}

export type ConnectionHandler = (error: string) => void

type FetcherState =
    'idle' |
    'fetching' |
    'error';

type RequestTask = {
    req: any;
    executer: PromiseExecuter;
}

export class AccumulatedFetcher {
    private url: string;
    private connectionHandler: ConnectionHandler;
    private signal?: AbortSignal;
    private toSend: RequestTask[];
    private beingSent: RequestTask[];
    private respPromiseExecuters: PromiseExecuter[];
    private state: FetcherState = 'idle';

    constructor(url: string, connectionHandler: ConnectionHandler, signal?: AbortSignal) {
        this.url = url;
        this.connectionHandler = connectionHandler;
        this.signal = signal;
        this.toSend = [];
        this.beingSent = [];
        this.respPromiseExecuters = [];
    }

    private startFetch() {
        this.state = 'fetching';
        if (this.beingSent.length === 0) {
            throw new Error('Illegal state: beingSent empty in startFetch')
        }

        const req: AccumulatedReq = {
            requests: this.beingSent.map(x => x.req)
        }
        apiFetchPost<AccumulatedReq, AccumulatedResp>(this.url, req, this.signal).then(resp => {
            if (resp.type === 'error') {
                this.state = 'error';
                this.connectionHandler(resp.error)
                return;
            }

            if (resp.responses.length !== this.beingSent.length) throw new Error(`Illegal state: resp.responses.length=${resp.responses.length} !== ${this.beingSent.length} = this.beingSent.length`);
            for (let i = 0; i < resp.responses.length; ++i) {
                this.beingSent[i].executer.resolve(resp.responses[i]);
            }

            this.beingSent.length = 0;

            if (this.toSend.length > 0) {
                const tmp = this.toSend;
                this.toSend = this.beingSent;
                this.beingSent = tmp;
                this.startFetch();
            } else {
                this.state = 'idle';
            }
        })
    }

    push<Req, Resp>(req: Req): Promise<ApiResp<Resp>> {
        if (this.signal?.aborted) return Promise.reject(new Error('signal of AccumulatedFetcher aborted'));
        return new Promise<ApiResp<Resp>>((resolve, reject) => {
            this.toSend.push({
                req: req,
                executer: {
                    resolve: resolve,
                    reject: reject
                }
            })
            switch (this.state) {
                case 'idle':
                    if (this.beingSent.length > 0) {
                        throw new Error('Illegal state: beingSent not empty when idle');
                    }
                    const tmp = this.toSend;
                    this.toSend = this.beingSent;
                    this.beingSent = tmp;
                    this.startFetch();
                    break;
            }
            })
    }

    /**
     * to be called after an error sent via the connectionHandler after the reason for the error has disappeared.
     */
    retryAfterError() {
        if (this.signal?.aborted) return;
        switch (this.state) {
            case 'error':
                break;
            default:
                return;
        }

        if (this.beingSent.length > 0) {
            // fetch again
            this.startFetch();
        }
    }
}
