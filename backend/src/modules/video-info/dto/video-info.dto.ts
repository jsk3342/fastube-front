import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VideoInfoRequestDto {
  @ApiProperty({
    description: '유튜브 비디오 ID',
    example: 'dQw4w9WgXcQ',
  })
  @IsNotEmpty()
  @IsString()
  id: string;
}

export class VideoInfoDataDto {
  @ApiProperty({ description: '영상 제목' })
  title: string;

  @ApiProperty({ description: '채널명' })
  channelName: string;

  @ApiProperty({ description: '썸네일 URL' })
  thumbnailUrl: string;

  @ApiProperty({ description: '영상 길이(초)' })
  duration: number;

  @ApiProperty({
    description: '사용 가능한, 지원되는 언어 목록',
    type: [String],
  })
  availableLanguages: string[];
}

export class VideoInfoResponseDto {
  @ApiProperty({ description: '성공 여부' })
  success: boolean;

  @ApiProperty({ description: '응답 데이터', type: VideoInfoDataDto })
  data: VideoInfoDataDto;
}
