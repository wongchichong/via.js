/**
 * CSS properties which accept numbers but are not in units of "px".
 *
 * @NOTE: Taken from React source code
 * @url{https://github.com/facebook/react/blob/37e4329bc81def4695211d6e3795a654ef4d84f5/packages/react-dom/src/shared/CSSProperty.js}
 */
export declare const unitlessCSSProperties: {
    animationIterationCount: boolean;
    borderImageOutset: boolean;
    borderImageSlice: boolean;
    borderImageWidth: boolean;
    boxFlex: boolean;
    boxFlexGroup: boolean;
    boxOrdinalGroup: boolean;
    columnCount: boolean;
    columns: boolean;
    flex: boolean;
    flexGrow: boolean;
    flexPositive: boolean;
    flexShrink: boolean;
    flexNegative: boolean;
    flexOrder: boolean;
    gridRow: boolean;
    gridRowEnd: boolean;
    gridRowSpan: boolean;
    gridRowStart: boolean;
    gridColumn: boolean;
    gridColumnEnd: boolean;
    gridColumnSpan: boolean;
    gridColumnStart: boolean;
    fontWeight: boolean;
    lineClamp: boolean;
    lineHeight: boolean;
    opacity: boolean;
    order: boolean;
    orphans: boolean;
    tabSize: boolean;
    widows: boolean;
    zIndex: boolean;
    zoom: boolean;
    fillOpacity: boolean;
    floodOpacity: boolean;
    stopOpacity: boolean;
    strokeDasharray: boolean;
    strokeDashoffset: boolean;
    strokeMiterlimit: boolean;
    strokeOpacity: boolean;
    strokeWidth: boolean;
};
export declare function isUnitlessProperty(styleName: keyof typeof unitlessCSSProperties): boolean;
