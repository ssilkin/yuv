function proc(readers, channel, cmp_mode, qmetric, grid) {
  channel = channel || 0;
  cmp_mode = readers.length > 1? (cmp_mode || 0) : 0;
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
      var p1  = readers[0].yuv(py, px);
      var p2 = readers.length > 1? readers[1].yuv(py, px) : p1;
      if (channel == 2) {
        p1[0] = p1[1];
        p2[0] = p2[1];
      } else if (channel == 3) {
        p1[0] = p1[2];
        p2[0] = p2[2];
      }
      if (channel != 0) {
        p1[1] = p1[2] = 128;
        p2[1] = p2[2] = 128;
      }

      if (cmp_mode > 0) {
        var y = p1[0] - p2[0];
        var u = p1[1] - p2[1];
        var v = p1[2] - p2[2];
        if (cmp_mode == 1) {
          p1[0] = y < 0? y + 255 : y;
          p1[1] = u < 0? u + 255 : u;
          p1[2] = v < 0? v + 255 : v;
        } else {
          var d = !!y | !!u | !!v;
          p1[0] = 255 * d;
          p1[1] = 255 * d;
          p1[2] = 255 * d;
        }
      }

      var y = p1[0] * 128;
      var u = p1[1] - 128;
      var v = p1[2] - 128;

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
