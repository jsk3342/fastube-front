import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SubtitleRequestDto {
  @ApiProperty({
    description: '유튜브 영상 URL',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiProperty({
    description: '자막 언어 코드',
    example: 'ko',
    default: 'ko',
  })
  @IsString()
  language: string;
}

export class VideoInfoDto {
  @ApiProperty({ description: '영상 제목' })
  title: string;

  @ApiProperty({ description: '채널명' })
  channelName: string;

  @ApiProperty({ description: '썸네일 URL' })
  thumbnailUrl: string;
}

export class CaptionDto {
  @ApiProperty({ description: '시작 시간(초)' })
  start: string;

  @ApiProperty({ description: '지속 시간(초)' })
  dur: string;

  @ApiProperty({ description: '자막 텍스트' })
  text: string;
}

export class SubtitleDataDto {
  @ApiProperty({ description: '자막 텍스트 (전체)' })
  text: string;

  @ApiProperty({
    description: '자막 목록',
    type: [CaptionDto],
    required: false,
  })
  subtitles?: CaptionDto[];

  @ApiProperty({
    description: '영상 정보',
    type: VideoInfoDto,
    required: false,
  })
  videoInfo?: VideoInfoDto;
}

export class SubtitleResponseDto {
  @ApiProperty({ description: '성공 여부' })
  success: boolean;

  @ApiProperty({ description: '응답 데이터', type: SubtitleDataDto })
  data: SubtitleDataDto;
}
