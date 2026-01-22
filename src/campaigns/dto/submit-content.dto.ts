import { IsUrl, IsNotEmpty, Matches } from 'class-validator';

export class SubmitContentDto {
    @IsNotEmpty()
    @IsUrl({}, { message: 'Please provide a valid URL' })
    @Matches(/instagram\.com\/reel\//, { message: 'Only Instagram Reel URLs are supported at this time' })
    url: string;
}
