import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class SearchKrokDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  continuation?: string;
}
