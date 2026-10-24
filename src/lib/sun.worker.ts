// Computes the pixels of the sun away from the page's main thread (see `sun.ts`).
import { sunPixels } from './sun';

const { disc, corona } = sunPixels();
postMessage({ disc, corona }, { transfer: [disc.buffer, corona.buffer] });
