import type { Environment } from '../types';

export class EnvService {
    public readonly environment: string;
    public readonly version: string;

    public get inProductionBuild(): boolean {
        return this.environment === 'production';
    }

    public get isDevelopmentBuild(): boolean {
        return this.environment === 'development';
    }

    public constructor(environment: Environment, version: string) {
        this.environment = environment;
        this.version = version;
    }
}
