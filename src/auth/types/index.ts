export type Tokens = {
    access_token: string;
    refresh_token: string;
};

export type JwtPayload = {
    sub: number;
    email: string;
    role: string;
};
