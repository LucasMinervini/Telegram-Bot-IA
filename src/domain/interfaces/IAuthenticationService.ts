export interface IAuthResult {
  authorized: boolean;
  userId: number;
  reason?: string;
}

export interface IAuthenticationService {
  isAuthorized(userId: number): IAuthResult;
}
