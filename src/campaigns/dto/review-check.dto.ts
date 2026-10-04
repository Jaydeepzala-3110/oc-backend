import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewCheckDto {
  /** Check id to resolve, e.g. 'required_sound', 'min_duration', 'content_rules'. */
  @IsString()
  @IsNotEmpty()
  checkId: string;

  @IsBoolean()
  passed: boolean;

  @IsString()
  @IsOptional()
  note?: string;
}
