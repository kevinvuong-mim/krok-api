import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty } from 'class-validator';

export class RequestKaraokeDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  videoId: string;
}
