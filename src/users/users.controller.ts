import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetCurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get('profile')
    async getProfile(@GetCurrentUser('sub') userId: number) {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Remove sensitive fields
        const { password, hashedRefreshToken, ...profile } = user;
        return profile;
    }

    @Patch('profile')
    async updateProfile(
        @GetCurrentUser('sub') userId: number,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.usersService.updateProfile(userId, updateUserDto);
    }
}
