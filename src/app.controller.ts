import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
 
  @Get()
  async getLives(){
    const result =  await this.appService.getLives()
   
    return result;
    
  }
}
