export {};
declare global {
    export interface ViaType {
        __ObjectSymbol: symbol;
        _AddToQueue(arg0: any[]): any;
        _WrapArg(value: any): any;
        _MakeObject: (id: any) => {
            _objectId: any;
        };
        finalizationRegistry: any;
        __TargetSymbol: symbol;
        postMessage(arg0: {
            type: string;
            ids?: any[];
            cmds?: any[];
            flushId?: number;
        }): any;
        _GetNextObjectId: () => number;
        Flush(Flush: any): any;
        OnMessage: (data: {
            type: string;
            getResults: any;
            flushId: any;
            id: any;
            args: any[];
        }) => void;
        _UnwrapArg(valueData: any): any;
        _MakeProperty(_objectId: number, arg1: any[]): any;
    }
    interface Window {
        Via: ViaType & Window & typeof globalThis;
        get<T>(proxy: any): Promise<T>;
        via: ViaType & Window & typeof globalThis;
    }
    const Via: ViaType & Window & typeof globalThis;
    function get<T>(proxy: any): Promise<T>;
    const via: ViaType & Window & typeof globalThis;
}
