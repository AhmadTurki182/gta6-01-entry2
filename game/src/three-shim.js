// three-shim.js — exposes the vendored classic three.min.js global as the default
// export of an ES module, so game modules use `import THREE from './three-shim.js'`
// with no network request and no bare specifier.
const THREE = window.THREE;
export default THREE;
