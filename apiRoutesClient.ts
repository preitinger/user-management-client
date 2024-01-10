import { ApiResp } from "./user-management-common/apiRoutesCommon";

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
