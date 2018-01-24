function proc(readers, channel, mod_comp, qmetric, grid) {
  channel = channel || 'yuv';
  var width = readers[0].width;
  var height = readers[0].height;
  if (readers.length > 1) {
    width = Math.max(width, readers[1].width);
    height = Math.max(height, readers[1].height);
  }

  var blk_width = grid? grid : width;
  var blk_height = grid? grid : height;

  var rgb = new ImageData(width, height);
  for (var py = 0; py < height; ++py) {
    for (var px = 0; px < width; ++px) {
      var yuv1  = readers[0].yuv(py, px);
      var yuv2 = readers.length > 1? readers[1].yuv(py, px) : yuv1;
      if (channel == 'u') {
        yuv1[0] = yuv1[1];
        yuv2[0] = yuv2[1];
      } else if (channel == 'v') {
        yuv1[0] = yuv1[2];
        yuv2[0] = yuv2[2];
      }
      if (channel != 'yuv') {
        yuv1[1] = yuv1[2] = 128;
        yuv2[1] = yuv2[2] = 128;
      }

      var y = yuv1[0] * 128;
      var u = yuv1[1] - 128;
      var v = yuv1[2] - 128;

      var b = (y + 164 * v) >> 7;
      var g = (y - 28 * u - 49 * v) >> 7;
      var r = (y + 272 * u) >> 7;
      var irgb = 4 * (py * width + px);
      rgb.data[irgb++] = b > 255? 255 : (b < 0? 0 : b);
      rgb.data[irgb++] = g > 255? 255 : (g < 0? 0 : g);
      rgb.data[irgb++] = r > 255? 255 : (r < 0? 0 : r);
      rgb.data[irgb++] = 255;
    }
  }

  return rgb;
}