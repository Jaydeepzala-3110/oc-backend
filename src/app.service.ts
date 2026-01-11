import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    console.log('rached here' , process.env.PORT);
    return 'Hello World!';
  }
}
