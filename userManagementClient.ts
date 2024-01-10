import { LoginReq, LoginResp } from "./user-management-common/login";
import { LogoutReq, LogoutResp } from "./user-management-common/logout";
import { ApiResp } from "./user-management-common/apiRoutesCommon";
import { RegisterReq, RegisterResp } from "./user-management-common/register";

export function userRegisterFetch(req: RegisterReq): Promise<ApiResp<RegisterResp>> {
    return fetch('/api/user/register', {
        method: 'POST',
        body: JSON.stringify(req)
    }).then(resp => resp.json())
}

export function userLoginFetch(req: LoginReq): Promise<ApiResp<LoginResp>> {
    return fetch('/api/user/login', {
        method: 'POST',
        body: JSON.stringify(req)
    }).then(resp => resp.json())
}

export function userLogoutFetch(req: LogoutReq): Promise<ApiResp<LogoutResp>> {
    return fetch('/api/user/logout', {
        method: 'POST',
        body: JSON.stringify(req)
    }).then(resp => resp.json())
}