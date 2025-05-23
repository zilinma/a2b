import { LLMProvider, LLMMessage, LLMRequest, LLMError, LLMResponse } from '../../../types/llm';

// Mock LLM Provider implementation
class MockLLMProvider implements LLMProvider {
  private shouldError: boolean = false;
  private delay: number = 0;
  private response: string = 'Mock response';

  constructor(options: { shouldError?: boolean; delay?: number; response?: string } = {}) {
    this.shouldError = options.shouldError || false;
    this.delay = options.delay || 0;
    this.response = options.response || 'Mock response';
  }

  async getResponse(request: LLMRequest): Promise<LLMResponse> {
    await this.simulateDelay();
    
    if (this.shouldError) {
      throw this.createError();
    }

    return {
      content: this.response,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      }
    };
  }

  async streamResponse(
    request: LLMRequest,
    callbacks: {
      onToken: (token: string) => void;
      onComplete: () => void;
      onError: (error: LLMError) => void;
    }
  ): Promise<void> {
    await this.simulateDelay();

    if (this.shouldError) {
      callbacks.onError(this.createError());
      return;
    }

    // Simulate streaming by splitting the response into tokens
    const tokens = this.response.split(' ');
    for (const token of tokens) {
      callbacks.onToken(token + ' ');
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    callbacks.onComplete();
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
  }

  private createError(): LLMError {
    return {
      code: 'MOCK_ERROR',
      message: 'Mock error message',
      status: 500,
      retryAfter: 1000
    };
  }
}

describe('LLM Provider', () => {
  let provider: MockLLMProvider;

  beforeEach(() => {
    provider = new MockLLMProvider();
  });

  describe('getResponse', () => {
    it('should return a successful response', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        temperature: 0.7
      };

      const response = await provider.getResponse(request);
      expect(response.content).toBe('Mock response');
      expect(response.usage).toBeDefined();
      expect(response.usage?.totalTokens).toBe(30);
    });

    it('should handle errors', async () => {
      provider = new MockLLMProvider({ shouldError: true });
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(provider.getResponse(request)).rejects.toMatchObject({
        code: 'MOCK_ERROR',
        message: 'Mock error message',
        status: 500
      });
    });

    it('should respect delay', async () => {
      provider = new MockLLMProvider({ delay: 100 });
      const start = Date.now();
      
      await provider.getResponse({
        messages: [{ role: 'user', content: 'Hello' }]
      });

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('streamResponse', () => {
    it('should stream tokens and complete', async () => {
      const tokens: string[] = [];
      const callbacks = {
        onToken: (token: string) => tokens.push(token),
        onComplete: jest.fn(),
        onError: jest.fn()
      };

      await provider.streamResponse(
        { messages: [{ role: 'user', content: 'Hello' }] },
        callbacks
      );

      expect(tokens.join('')).toBe('Mock response ');
      expect(callbacks.onComplete).toHaveBeenCalled();
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      provider = new MockLLMProvider({ shouldError: true });
      const callbacks = {
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn()
      };

      await provider.streamResponse(
        { messages: [{ role: 'user', content: 'Hello' }] },
        callbacks
      );

      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(callbacks.onComplete).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MOCK_ERROR',
        message: 'Mock error message'
      }));
    });

    it('should respect delay in streaming', async () => {
      provider = new MockLLMProvider({ delay: 100 });
      const start = Date.now();
      
      await provider.streamResponse(
        { messages: [{ role: 'user', content: 'Hello' }] },
        {
          onToken: jest.fn(),
          onComplete: jest.fn(),
          onError: jest.fn()
        }
      );

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
}); 