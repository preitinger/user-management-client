import { ChatReq } from "../../chat/chat-common";
import { AccumulatedFetching } from "../AccumulatedFetching"
import { AccumulatedReq, AccumulatedResp, ApiResp } from "../../user-management-server/user-management-common/apiRoutesCommon";
import PromiseChecker from "../../pr-test-utils/PromiseChecker";

jest.useFakeTimers();

const NYI = () => {
    throw new Error('Not implemented');
}

// function sleep(ms: number): Promise<void> {
//     return new Promise(res => {
//         setTimeout(() => {
//             res();
//         }, ms)
//     })
// }

function fakeSleep(ms: number): Promise<void> {
    return jest.advanceTimersByTimeAsync(ms);
}

type FetchResponseProducer = (url: string, body?: string | any) => Promise<any>

const registeredFetchResponseProducers: { [key: string]: FetchResponseProducer } = {}

const createNextFetchResponse = (url: string, body?: string | any): Promise<any> => {
    const gen = registeredFetchResponseProducers[url];
    if (registeredFetchResponseProducers[url] == null) {
        return Promise.reject({ undefined: 'json ;-)' })
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
            return createNextFetchResponse(url.toString(), init?.body);
        },
        text: NYI,

    }

    return res;
}

let triggerFetchResponse: (() => void) | null = null;
let triggerFetchError: ((reason: any) => void) | null = null;

const echoJsonProducer: FetchResponseProducer = async (url: string, body?: string | undefined) => {
    console.log('nextJson: body=', body);
    if (body == null) {
        return { type: 'error', error: 'body not defined'};
    }
    const req: AccumulatedReq = JSON.parse(body);
    const resp: ApiResp<AccumulatedResp> = {
        type: 'success',
        responses: req.requests
    }

    try {
        console.log('before await trigger');
        await new Promise<void>((res, rej) => {
            console.log('before setting triggerFetchResponse');
            triggerFetchResponse = res;
            triggerFetchError = rej;
            console.log('after setting triggerFetchResponse');
        });
        console.log('after await trigger');
        return resp;
    } catch(reason) {
        console.log('echoJsonProducer caught', reason);
        throw reason;
    }
}



beforeEach(() => {
    registeredFetchResponseProducers['/testUrl'] = echoJsonProducer;
});

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
        lines: ['bla'],
        token: 'bla',
        user: 'bla'
    }
    await fakeSleep(1000);
    expect(f.getState()).toBe('waiting');
    const resp = f.push(req);
    await fakeSleep(1);
    expect(f.getState()).toBe('fetching');
    const checkResp = new PromiseChecker(resp);
    expect(checkResp.hasResolved()).toBeFalsy();
    await fakeSleep(1);
    expect(f.getState()).toBe('fetching');
    console.log('triggerFetchResponse', triggerFetchResponse);
    if (triggerFetchResponse == null) throw new Error('fetch not ready');
    expect(checkResp.hasResolved()).toBeFalsy();
    triggerFetchResponse();
    await fakeSleep(1);
    expect(f.getState()).toBe('waiting');
    expect(checkResp.hasResolved()).toBeTruthy();
    console.log('resp', resp);
    expect(await resp).toEqual(req);
    f.close();
    await fakeSleep(1);
    expect(f.getState()).toBe('closed');
    console.log('The End');
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
        lines: ['1'],
        token: 'bla',
        user: 'bla'
    }
    const req2: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        lines: ['2'],
        token: 'bla',
        user: 'bla'
    }

    await fakeSleep(10);
    expect(f.getState()).toBe('waiting');

    const respProm1 = f.push<any, any>(req1);
    const respProm2 = f.push<any, any>(req2);

    await fakeSleep(0);
    expect(f.getState()).toBe('fetching');
    expect(triggerFetchResponse).not.toBeNull();
    if (triggerFetchResponse != null) triggerFetchResponse();

    expect(await respProm1).toEqual(req1);
    expect(f.getState()).toBe('waiting');
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
        lines: ['1'],
        token: 'bla',
        user: 'bla'
    }
    const respProm1 = f.push(req1);
    const checkProm1 = new PromiseChecker(respProm1);
    await fakeSleep(1000);
    expect(f.getState()).toBe('waiting');
    expect(checkProm1.hasResolved()).toBe(false);
    f.setInterrupted(false);
    await fakeSleep(0);
    expect(f.getState()).toBe('fetching');
    // Now, the accumulated fetch (with only req1) is expected to have been executed.
    const req2: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        lines: ['2'],
        token: 'bla',
        user: 'bla'
    }
    const respProm2 = f.push(req2);
    const checkProm2 = new PromiseChecker(respProm2);
    await fakeSleep(0);
    expect(f.getState()).toBe('fetching');
    const req3: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        lines: ['3'],
        token: 'bla',
        user: 'bla'
    }
    const respProm3 = f.push(req3);
    const checkProm3 = new PromiseChecker(respProm3);
    await fakeSleep(1000);
    expect(f.getState()).toBe('fetching');
    // the simulated response of the accumulated fetch is still pending, so the responses must not yet have been returned:
    expect(checkProm1.hasResolved()).toBe(false);
    expect(checkProm2.hasResolved()).toBe(false);
    expect(checkProm3.hasResolved()).toBe(false);
    expect(triggerFetchResponse).not.toBeNull();

    if (triggerFetchResponse != null) triggerFetchResponse();
    await fakeSleep(0);
    expect(f.getState()).toBe('fetching');
    // Now, the fetch response is expected to have been sent. Only the first response is expected to have been delivered.
    // A second accumulated fetch (with req2 and req3) is expected to have been sent, but the simulated response not to be sent back.
    expect(checkProm1.hasResolved()).toBe(true);
    expect(checkProm2.hasResolved()).toBe(false);
    expect(checkProm3.hasResolved()).toBe(false);

    if (triggerFetchResponse != null) triggerFetchResponse();
    await fakeSleep(0);
    // Now, the 2nd fetch response (for req2 and req3) is expected to have been sent. All 3 esponses are expected to have been delivered.
    expect(f.getState()).toBe('waiting');
    expect(checkProm1.hasResolved()).toBe(true);
    expect(checkProm2.hasResolved()).toBe(true);
    expect(checkProm3.hasResolved()).toBe(true);

    expect(await respProm1).toEqual(req1);
    expect(await respProm2).toEqual(req2);
    expect(await respProm3).toEqual(req3);
    f.close();
    await fakeSleep(0);
    expect(f.getState()).toBe('closed');
})

test('fetch error', async () => {
    const fetchError = jest.fn((error: string) => {})
    const f = new AccumulatedFetching('/testUrl', {
        fetchError: fetchError
    });
    const req: ChatReq = {
        type: 'chat',
        chatId: 'bla',
        lastEventId: -1,
        lines: ['bla'],
        token: 'bla',
        user: 'bla'
    }

    const resp = f.push(req);
    const checkResp = new PromiseChecker(resp);
    await fakeSleep(1000);
    expect(f.isInterrupted()).toBe(false);
    if (triggerFetchError == null) throw new Error('triggerFetchError not set');
    triggerFetchError(new Error('Failed to fetch'));
    expect(fetchError.mock.calls.length).toBe(0);
    await fakeSleep(1000);

    // f must be in interrupted state now, and fetchError must have been called,
    // and resp must not have been resolved
    expect(checkResp.hasResolved()).toBe(false);
    expect(fetchError.mock.calls.length).toBe(1);
    console.log(`arg of fetchError "${fetchError.mock.calls[0][0]}"` );
    expect(f.isInterrupted()).toBe(true);

    // Now, test if f repeats the fetch correctly after resetting interrupted

    f.setInterrupted(false);
    await fakeSleep(1);
    if (triggerFetchResponse == null) throw new Error('triggerFetchResponse not set');
    triggerFetchResponse();
    await fakeSleep(1);
    expect(checkResp.hasResolved()).toBe(true);
    expect(await resp).toEqual(req); // because of echo implementation in this test

    f.close();

})

test('close while waiting', async () => {
    const f = new AccumulatedFetching('/testUrl', {
        fetchError: (error) => {
            console.error('fetchError', error);
        }
    });
    const state = f.getState();
    expect(state).toBe('waiting');
    await fakeSleep(1);
    expect(f.getState()).toBe('waiting');
    expect(f.isClosing()).toBe(false);
    f.close();
    expect(f.isClosing()).toBe(true);
    expect(f.getState()).toBe('waiting');
    await fakeSleep(1000);
    expect(f.getState()).toBe('closed');
})