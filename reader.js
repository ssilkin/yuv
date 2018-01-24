function FrameReader() {
  this.file = 0;
  this.data = [];
  this.file_fmt = 'yuv';
  this.pix_fmt = '420';
  this.width = 640;
  this.height = 360;
  this.frame_len = 0;
  this.frame_inf = new Map();
  this.num_frames = 0;
  this.reader = new FileReader();

  this.open = function(file, callback) {
    this.file = file;
    this.file_fmt = this.file.name.toLowerCase().split('.').pop();
    if (this.file_fmt == 'y4m') {
      var self = this;
      this.read(0, 100, function() {
        var y4m = self.parse_y4m_header(self.data, 0);
        self.frame_inf.set(0, y4m);
        self.seek(1, function() {
          var frame_inf = self.frame_inf.get(1);
          self.num_frames = self.frame_inf.size;
          if (frame_inf) {
            self.num_frames = 1 + (self.file.size - frame_inf.pos) /
                (frame_inf.header_len + frame_inf.frame_len);
          }
          callback(self.num_frames > 0);
        });
      });
    } else {
      var width = 640;
      var height = 480;
      var pix_fmt = '420';
      var m = file.name.toLowerCase().match(/([\d]{1,4})x([\d]{1,4})/);
      if (m) {
        width = m[1];
        height = m[2];
      } else {
        m = file.name.toLowerCase().match(/(1080|720|vga|qcif|cif)/);
        if (m) {
          const wxh = {'1080':[1920,1080], '720':[1280,720],
              'vga':[640,480], 'cif':[352, 288], 'qcif':[176, 144]};
          width = wxh[m[1]][0];
          height = wxh[m[1]][1];
        }
      }

      m = file.name.toLowerCase().match(/[-_](420|422|444|400|gray)/)
      if (m) {
        pix_fmt = m[1] == '400'? 'gray' : m[1];
      }

      this.set_params(width, height, pix_fmt);

      this.num_frames = Math.floor(this.file.size / this.frame_len);
      callback(this.num_frames > 0);
    }
  }

  this.seek = function(frame_num, callback) {
    if (this.file_fmt != 'y4m') {
      this.read(frame_num * this.frame_len, this.frame_len, function() {
        callback();
      });
    } else {
      var self = this;
      // If required frame was not read before seek backward to already
      // parsed frame then step forward frame-by-frame to required one.
      // Only frame headers of intermediate frames are read and parsed.
      frame_inf = this.frame_inf.get(frame_num);
      if (frame_inf) {
        const pos = frame_inf.pos + frame_inf.header_len;
        this.read(pos, frame_inf.frame_len, function() {
          self.set_params(frame_inf.w, frame_inf.h, frame_inf.c);
          callback();
        });
      } else {
        frame_inf = this.frame_inf.get(frame_num - 1);
        if (frame_inf) {
          const pos = frame_inf.pos +
              frame_inf.header_len + frame_inf.frame_len;
          this.read(pos, 100, function() {
            var y4m = self.parse_y4m_header(self.data, pos, frame_inf.w,
                frame_inf.h, frame_inf.c);
            self.frame_inf.set(frame_num, y4m);
            setTimeout(function() { self.seek(frame_num, callback); }, 0);
          });
        } else {
          setTimeout(function() { self.seek(frame_num - 1, callback);}, 1);
        }
      }
    }
  }

  this.yuv = function(py, px) {
    var y, u, v;
    y = this.data[py * this.width + px];
    if (this.pix_fmt == 'gray') {
      u = 128;
      v = 128;
    } else {
      var chroma_height = this.height >> this.chroma_vert_freq_log2;
      var chroma_width = this.width >> this.chroma_horz_freq_log2;
      var chroma_py = py >> this.chroma_vert_freq_log2;
      var chroma_px = px >> this.chroma_horz_freq_log2;
      u = this.data[this.height * this.width + chroma_py * chroma_width + chroma_px];
      v = this.data[this.height * this.width + chroma_height * chroma_width
          + chroma_py * chroma_width + chroma_px];
    }
    return [y, u, v];
  }

  this.read = function(pos, bytes, callback) {
    if (this.file) {
      var self = this;
      this.reader.onloadend = function(evt) {
        if (evt.target.readyState == FileReader.DONE) {
          self.data = new Uint8Array(evt.target.result);
          callback();
        }
      }
      var blob = this.file.slice(pos, pos + bytes + 1);
      this.reader.readAsArrayBuffer(blob);
    }
  }

  this.parse_y4m_header = function(data, pos, def_w, def_h, def_c) {
    var header = '';
    var length = 0;
    var found_frame = false;
    while(length < data.length) {
      var byte = data[length++];
      if (header.length >= 5 && header.slice(header.length - 5) == 'FRAME') {
        found_frame = true;
      }
      if (byte == 0x0a) {
          if (found_frame)
            break;
        byte = 0x20;
      }
      header += String.fromCharCode(byte);
    }
    var header = header.split(' ');
    var y4m = {};
    y4m.w = def_w || 0;
    y4m.h = def_h || 0;
    y4m.c = def_c || '420';
    for (var i = 0; i < header.length; ++i) {
      if (header[i][0] == 'W') {
        y4m.w = parseInt(header[i].slice(1));
      } else if (header[i][0] == 'H') {
        y4m.h = parseInt(header[i].slice(1));
      } else if (header[i][0] == 'C') {
        y4m.c = header[i].slice(1, 4);
      }
    }
    y4m.header_len = length;
    y4m.frame_len = y4m.w * y4m.h;
    if (!('c' in y4m) || y4m.c.slice(0, 3) == '420') {
      y4m.frame_len = y4m.frame_len * 3 / 2;
    } else if (y4m.c.slice(0, 3) == '422') {
      y4m.frame_len = y4m.frame_len * 2;
    } else {
      y4m.frame_len = y4m.frame_len * 3;
    }
    y4m.pos = pos;
    return y4m;
  }

  this.set_params = function(width, height, pix_fmt) {
    this.width = width;
    this.height = height;
    this.pix_fmt = pix_fmt;
    this.chroma_horz_freq_log2 = 0;
    this.chroma_vert_freq_log2 = 0;
    this.frame_len = this.width * this.height;
    if (this.pix_fmt == '444') {
      this.frame_len *= 3;
    } else if (this.pix_fmt == '422') {
      this.frame_len *= 2;
      this.chroma_horz_freq_log2 = 1;
    } else if (this.pix_fmt == '420') {
      this.frame_len *= 3;
      this.frame_len /= 2;
      this.chroma_horz_freq_log2 = 1;
      this.chroma_vert_freq_log2 = 1;
    }
  }
}