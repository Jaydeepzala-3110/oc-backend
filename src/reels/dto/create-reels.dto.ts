import { IsArray, IsNotEmpty, IsNumber, IsString, IsUrl } from 'class-validator';

export class CreateReelsDto {
    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty()
    @IsUrl({}, { each: true })
    urls: string[];

    @IsNumber()
    @IsNotEmpty()
    campaignId: number;
}
