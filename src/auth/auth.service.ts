import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from './dto/auth.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { Tokens } from './types';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private config: ConfigService,
    ) { }

    async signupLocal(dto: CreateUserDto): Promise<any> {

        const isUserExists = await this.usersService.findByEmail(dto.email);
        if (isUserExists) throw new ForbiddenException('Users already exists');

        const hash = await this.hashData(dto.password);
        const newUser = await this.usersService.create({
            ...dto,
            password: hash,
        });

        const tokens = await this.getTokens(newUser.id, newUser.email, newUser.role);
        await this.updateRtHash(newUser.id, tokens.refresh_token);
        return tokens;
    }

    async signinLocal(dto: AuthDto): Promise<Tokens> {
        const user = await this.usersService.findByIdentifier(dto.email, dto.phoneNumber);

        if (!user) {
            if (dto.email) {
                throw new UnauthorizedException('User with this email not found');
            } else if (dto.phoneNumber) {
                throw new UnauthorizedException('User with this phone number not found');
            }
            throw new UnauthorizedException('User not found');
        }

        const passwordMatches = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatches) throw new UnauthorizedException('Incorrect password');

        const tokens = await this.getTokens(user.id, user.email, user.role);
        await this.updateRtHash(user.id, tokens.refresh_token);
        return tokens;
    }


    async logout(userId: number) {
        await this.usersService.updateHashedRefreshToken(userId, null);
    }

    async refreshTokens(userId: number, rt: string): Promise<Tokens> {
        const user = await this.usersService.findById(userId);
        if (!user || !user.hashedRefreshToken)
            throw new ForbiddenException('Access Denied');

        const rtMatches = await bcrypt.compare(rt, user.hashedRefreshToken);
        if (!rtMatches) throw new ForbiddenException('Access Denied');

        const tokens = await this.getTokens(user.id, user.email, user.role);
        await this.updateRtHash(user.id, tokens.refresh_token);
        return tokens;
    }

    async updateRtHash(userId: number, rt: string) {
        const hash = await this.hashData(rt);
        await this.usersService.updateHashedRefreshToken(userId, hash);
    }

    async hashData(data: string) {
        return bcrypt.hash(data, 10);
    }

    async getTokens(userId: number, email: string, role: string): Promise<Tokens> {
        const [at, rt] = await Promise.all([
            this.jwtService.signAsync(
                {
                    sub: userId,
                    email,
                    role,
                },
                {
                    secret: this.config.jwtAccessSecret,
                    expiresIn: this.config.jwtAccessExpiration as any,
                },
            ),
            this.jwtService.signAsync(
                {
                    sub: userId,
                    email,
                    role,
                },
                {
                    secret: this.config.jwtRefreshSecret,
                    expiresIn: this.config.jwtRefreshExpiration as any,
                },
            ),
        ]);

        return {
            access_token: at,
            refresh_token: rt,
        };
    }


}
