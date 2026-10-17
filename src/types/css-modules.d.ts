declare module '*.scss' {
    type IClassNames = Record<string, string>;
    const module: IClassNames;
    export default module;
    export var css: string;
}
