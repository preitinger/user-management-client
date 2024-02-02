import { ChatReq } from "../../chat/chat-common";
import { AccumulatedFetching } from "../AccumulatedFetching"
import { AccumulatedReq, AccumulatedResp, ApiResp } from "../../user-management-server/user-management-common/apiRoutesCommon";


const NYI = () => {
    throw new Error('Not implemented');
}

function sleep(ms: number): Promise<void> {
    return new Promise(res => {
        setTimeout(() => {
            res();
        }, ms)
    })
}

function respForFetch(url: string, status: number, json: any) {
    const headers: Headers = {
        append: NYI,
        delete: NYI,
        entries: NYI,
        get: NYI,
        getSetCookie: NYI,
        has: NYI,
        set: NYI,
        forEach: NYI,
        keys: NYI,
        values: NYI,
        [Symbol.iterator]: NYI
    };
    const res: Response = {
        arrayBuffer: () => {
            console.error('not implemented')
            throw 'not implemented';
        },
        blob: () => {
            console.error('not implemented')
            throw 'not implemented';
        },
        headers: headers,
        body: null,
        ok: false,
        redirected: false,
        status: status,
        bodyUsed: false,
        statusText: '',
        type: "basic",
        url: url.toString(),
        clone: NYI,
        formData: NYI,
        json: () => Promise.resolve(json),
        text: NYI,

    }

    return res;

}

type JsonProducer = (url: string, body?: string | any) => any

const registeredJsonGenerators: { [key: string]: JsonProducer } = {}

const createNextJson = (url: string, body?: string | any): any => {
    const gen = registeredJsonGenerators[url];
    if (registeredJsonGenerators[url] == null) {
        return { undefined: 'json ;-)' }
    }
    return gen(url, body);
}

global.fetch = async (url: URL | RequestInfo, init?: RequestInit | undefined) => {
    console.log('url', url);
    console.log('init', init);
    const headers: Headers = {
        append: NYI,
        delete: NYI,
        entries: NYI,
        get: NYI,
        getSetCookie: NYI,
        has: NYI,
        set: NYI,
        forEach: NYI,
        keys: NYI,
        values: NYI,
        [Symbol.iterator]: NYI
    };
    const res: Response = {
        arrayBuffer: () => {
            console.error('not implemented')
            throw 'not implemented';
        },
        blob: () => {
            console.error('not implemented')
            throw 'not implemented';
        },
        headers: headers,
        body: null,
        ok: false,
        redirected: false,
        status: 200,
        bodyUsed: false,
        statusText: '',
        type: "basic",
        url: url.toString(),
        clone: NYI,
        formData: NYI,
        json: () => {
            return Promise.resolve(createNextJson(url.toString(), init?.body));
        },
        text: NYI,

    }

    return res;
}

let triggerFetchResponse: (() => void) | null = null;

const echoJsonProducer: JsonProducer = async (url: string, body?: string | undefined) => {
    console.log('nextJson: body=', body);
    if (body == null) {
        return { type: 'error', error: 'body not defined'};
    }
    const req: AccumulatedReq = JSON.parse(body);
    const resp: ApiResp<AccumulatedResp> = {
        type: 'success',
        responses: req.requests
    }

    console.log('before await trigger');
    await new Promise<void>(res => {
        console.log('before setting triggerFetchResponse');
        triggerFetchResponse = res;
        console.log('after setting triggerFetchResponse');
    });
    console.log('after await trigger');
    return resp;
}



beforeEach(() => {
    registeredJsonGenerators['/testUrl'] = echoJsonProducer;
});

class PromiseChecker<T> {
    constructor(prom: Promise<T>) {
        prom.then(() => {
            this.resolved = true;
        })
    }

    hasResolved() {
        return this.resolved;
    }

    private resolved: boolean = false;
}

test('1 push', async () => {
    const f = new AccumulatedFetching('/testUrl', {
        fetchError: (error) => {
            console.log('fetchError', error);
        }
    })
    const req: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: 'bla',
        token: 'bla',
        user: 'bla'
    }
    const resp = f.push(req);
    const checkResp = new PromiseChecker(resp);
    expect(checkResp.hasResolved()).toBeFalsy();
    await sleep(0);
    console.log('triggerFetchResponse', triggerFetchResponse);
    if (triggerFetchResponse == null) throw new Error('fetch not ready');
    expect(checkResp.hasResolved()).toBeFalsy();
    triggerFetchResponse();
    await sleep(0);
    expect(checkResp.hasResolved()).toBeTruthy();
    console.log('resp', resp);
    expect(await resp).toEqual(req);
})

test('2 pushes', async() => {
    const f = new AccumulatedFetching('/testUrl', {
        fetchError: (error) => {
            console.log('fetchError', error);
        }
    })
    const req1: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: '1',
        token: 'bla',
        user: 'bla'
    }
    const req2: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: '2',
        token: 'bla',
        user: 'bla'
    }

    const respProm1 = f.push<any, any>(req1);
    const respProm2 = f.push<any, any>(req2);

    await sleep(0);
    expect(triggerFetchResponse).not.toBeNull();
    if (triggerFetchResponse != null) triggerFetchResponse();

    expect(await respProm1).toEqual(req1);
    expect(await respProm2).toEqual(req2);
})

test('setInterrupted', async () => {
    const f = new AccumulatedFetching('/testUrl', {
        fetchError: (error) => {
            console.log('fetchError', error);
        }
    })

    f.setInterrupted(true);
    const req1: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: '1',
        token: 'bla',
        user: 'bla'
    }
    const respProm1 = f.push(req1);;
    const checkProm1 = new PromiseChecker(respProm1);
    await sleep(1000);
    expect(checkProm1.hasResolved()).toBe(false);
    f.setInterrupted(false);
    await sleep(0);
    // Now, the accumulated fetch (with only req1) is expected to have been executed.
    const req2: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: '2',
        token: 'bla',
        user: 'bla'
    }
    const respProm2 = f.push(req2);
    const checkProm2 = new PromiseChecker(respProm2);
    await sleep(0);
    const req3: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        msg: '3',
        token: 'bla',
        user: 'bla'
    }
    const respProm3 = f.push(req3);
    const checkProm3 = new PromiseChecker(respProm3);
    await sleep(1000);
    // the simulated response of the accumulated fetch is still pending, so the responses must not yet have been returned:
    expect(checkProm1.hasResolved()).toBe(false);
    expect(checkProm2.hasResolved()).toBe(false);
    expect(checkProm3.hasResolved()).toBe(false);
    expect(triggerFetchResponse).not.toBeNull();

    if (triggerFetchResponse != null) triggerFetchResponse();
    await sleep(0);
    // Now, the fetch response is expected to have been sent. Only the first response is expected to have been delivered.
    // A second accumulated fetch (with req2 and req3) is expected to have been sent, but the simulated response not to be sent back.
    expect(checkProm1.hasResolved()).toBe(true);
    expect(checkProm2.hasResolved()).toBe(false);
    expect(checkProm3.hasResolved()).toBe(false);

    if (triggerFetchResponse != null) triggerFetchResponse();
    await sleep(0);
    // Now, the 2nd fetch response (for req2 and req3) is expected to have been sent. All 3 esponses are expected to have been delivered.
    expect(checkProm1.hasResolved()).toBe(true);
    expect(checkProm2.hasResolved()).toBe(true);
    expect(checkProm3.hasResolved()).toBe(true);

    expect(await respProm1).toEqual(req1);
    expect(await respProm2).toEqual(req2);
    expect(await respProm3).toEqual(req3);
})
