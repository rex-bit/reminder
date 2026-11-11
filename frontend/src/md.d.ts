import 'react';

// @material/web custom elements (md-*) are used as JSX tags through the wrappers in ui/controls.tsx.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [tag: `md-${string}`]: any;
    }
  }
}
