/** EHG Design Token System - TypeScript definitions */

export interface TokenRef {
  $ref: string;
}

export type TokenValue = string | TokenRef;

export interface BrandTokens {
  colors: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
}

export interface SemanticTokens {
  colors: {
    light: Record<string, TokenValue>;
    dark: Record<string, TokenValue>;
  };
  typography: Record<string, TokenValue>;
  spacing: Record<string, string>;
  radius: Record<string, TokenValue>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
}

export interface ComponentTokens {
  [component: string]: Record<string, TokenValue>;
}

export interface DesignTokens {
  $schema: string;
  version: string;
  description: string;
  brand: BrandTokens;
  semantic: SemanticTokens;
  component: ComponentTokens;
  metadata: {
    created: string;
    author: string;
    sd_id: string;
  };
}

declare const tokens: DesignTokens;
export default tokens;
