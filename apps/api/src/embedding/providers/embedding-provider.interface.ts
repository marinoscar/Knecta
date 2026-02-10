export interface EmbeddingProviderInfo {
  name: string;
  enabled: boolean;
  dimensions: number;
  isDefault: boolean;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getProviderName(): string;
}
