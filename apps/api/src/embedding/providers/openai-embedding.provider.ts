import { OpenAIEmbeddings } from '@langchain/openai';
import { EmbeddingProvider } from './embedding-provider.interface';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly embeddings: OpenAIEmbeddings;
  private readonly dimensions = 1536;
  private readonly modelName = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: this.modelName,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(texts);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getProviderName(): string {
    return 'openai';
  }
}
