export interface DatabaseConfig {
  type: 'sqlite' | 'postgres' | 'mysql';
  filename?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  synchronize: boolean;
  logging: boolean;
}

export const databaseConfig: DatabaseConfig = {
  type: 'sqlite',
  filename: ':memory:',
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
};

export default databaseConfig;
