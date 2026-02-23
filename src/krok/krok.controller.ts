import { Get, Query, HttpCode, Controller, HttpStatus } from '@nestjs/common';

import { Public } from '@/common/decorators';
import { KrokService } from '@/krok/krok.service';
import { SearchKrokDto } from '@/krok/dto/search-krok.dto';

@Controller('krok')
export class KrokController {
  constructor(private readonly krokService: KrokService) {}

  @Public()
  @Get('search')
  @HttpCode(HttpStatus.OK)
  search(@Query() searchKrokDto: SearchKrokDto) {
    return this.krokService.search(searchKrokDto.query, searchKrokDto.continuation);
  }
}
