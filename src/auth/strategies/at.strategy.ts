import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../types';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class AtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private config: ConfigService) {
        const secret = config.jwtAccessSecret;

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: secret || 'at-secret',
        });
    }

    validate(payload: JwtPayload) {
        return payload;
    }
}
