declare module 'parquetjs-lite' {
  export class ParquetSchema {
    constructor(schema: Record<string, any>);
  }

  export class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, any>): Promise<void>;
    close(): Promise<void>;
  }

  export class ParquetReader {
    static openFile(path: string): Promise<ParquetReader>;
    close(): Promise<void>;
  }
}
