import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Users } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(createUserDto: CreateUserDto): Promise<Users> {
        return this.prisma.user.create({
            data: {
                ...createUserDto,
                role: createUserDto.role || 'CLIPPER',
            },
        });
    }

    async findByEmail(email: string): Promise<Users | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    async findById(id: number): Promise<Users | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async updateHashedRefreshToken(userId: number, hashedRefreshToken: string | null): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { hashedRefreshToken },
        });
    }

    async updateProfile(userId: number, updateData: Partial<Users>): Promise<Users> {
        const { password, hashedRefreshToken, ...profile } = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
        });
        return profile as Users;
    }
}
