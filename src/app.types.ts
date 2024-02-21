export type Books = Book[];

export interface Book {
  rating_average: string;
  copyright: string;
  chapters: Chapter[];
  abridged: string;
  description: string;
  read_status: string;
  language: string;
  title: string;
  info_link: string;
  duration: string;
  author_link: string;
  seconds: number;
  narrated_by: string;
  product_id: string;
  genre: string;
  key: string;
  summary: string;
  author: string;
  image_url: string;
  title_short: string;
  rating_count: string;
  download_link: string;
  filename: string;
  release_date: string;
  user_id: string;
  ayce: string;
  publisher: string;
  files: File[];
  asin: string;
  region: string;
  purchase_date: string;
  series_link?: string;
  series_name?: string;
  series_sequence?: string;
}

export interface Chapter {
  start_offset_ms: number;
  length_ms: number;
  title: string;
  start_offset_sec: number;
  chapters?: Chapter[];
}

export interface File {
  path: string;
  kind: string;
  type: string;
}
