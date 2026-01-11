import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Users } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(createUserDto: CreateUserDto): Promise<Users> {
        return this.prisma.users.create({
            data: {
                ...createUserDto,
                role: createUserDto.role || 'CLIPPER',
            },
        });
    }

    async findByEmail(email: string): Promise<Users | null> {
        
        const isUserExists = await this.prisma.users.findUnique({
            where: { email },
        });
        if (isUserExists) return isUserExists;
        return null;
    }

    async findByPhoneNumber(phoneNumber: string): Promise<Users | null> {
        return this.prisma.users.findUnique({
            where: { phoneNumber },
        });
    }

    async findByIdentifier(email?: string, phoneNumber?: string): Promise<Users | null> {
        if (email) return this.findByEmail(email);
        if (phoneNumber) return this.findByPhoneNumber(phoneNumber);
        return null;
    }


    async findById(id: number): Promise<Users | null> {
        return this.prisma.users.findUnique({
            where: { id },
        });
    }

    async updateHashedRefreshToken(userId: number, hashedRefreshToken: string | null): Promise<void> {
        await this.prisma.users.update({
            where: { id: userId },
            data: { hashedRefreshToken },
        });
    }

    async updateProfile(userId: number, updateData: Partial<Users>): Promise<Users> {
        const { password, hashedRefreshToken, ...profile } = await this.prisma.users.update({
            where: { id: userId },
            data: updateData,
        });
        return profile as Users;
    }
}
