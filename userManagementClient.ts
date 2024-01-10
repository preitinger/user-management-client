import { RegisterReq, RegisterResp } from "./user-management-common/register";

export async function userRegisterFetch(req: RegisterReq): Promise<RegisterResp> {
    return fetch('/api/user/register', {
        method: 'POST',
        body: JSON.stringify(req)
    }).then(resp => resp.json())
}