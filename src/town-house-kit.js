// Unscaled source bounds, metres (X, height, Z). Uniform world scale only.
export const HOUSE_KIT = {
 SI_H01:[6.5854,3.8200,3.3946], SI_H02:[6.1362,3.2410,3.8116],
 SI_H03:[10.1617,3.6030,4.7356], SI_H04:[5.0746,3.9009,5.2630],
 SI_SH01:[10.0451,4.9693,6.8876], SI_SH02:[8.9346,6.4923,6.2471], SI_SH03:[9.9698,5.0338,6.1099],
};
// Door panels in the four residential sources are 0.699–0.714m high.
// A 4.4 uniform scale makes every ground-floor door at least 3m tall.
export const HOUSE_SCALE = {SI_H01:4.4,SI_H02:4.4,SI_H03:4.4,SI_H04:4.4,SI_SH01:3.5,SI_SH02:3.62,SI_SH03:3.5};
export function houseDimensions(model, factor=HOUSE_SCALE[model]) {
 const [w,h,d]=HOUSE_KIT[model];
 return {model,modelScale:factor,w:w*factor/.8,d:d*factor/.8,h:h*factor};
}
