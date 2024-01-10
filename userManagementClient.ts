// TODO create github projects apiRoutes-common, apiRoutes-client and apiRoutes-server and use them respectively in user-management-*
import { ApiResp } from "./user-management-common/apiRoutesCommon";
import { RegisterReq, RegisterResp } from "./user-management-common/register";

export function userRegisterFetch(req: RegisterReq): Promise<ApiResp<RegisterResp>> {
    return fetch('/api/user/register', {
        method: 'POST',
        body: JSON.stringify(req)
    }).then(resp => resp.json())
}