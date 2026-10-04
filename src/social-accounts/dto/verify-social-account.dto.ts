import { IsNotEmpty, IsNumber, IsString, Matches } from 'class-validator';

export class VerifySocialAccountDto {
    @IsNumber()
    @IsNotEmpty()
    accountId: number;

    /** Must match the code shown in the UI for this verification session */
    @IsString()
    @IsNotEmpty()
    @Matches(/^OC-\d{4,6}$/)
    code: string;
}
