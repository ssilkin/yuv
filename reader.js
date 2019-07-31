function FrameReader() {
  this.file = 0;
  this.data = [];
  this.file_fmt = 'yuv';
  this.pix_fmt = 'yv12';
  this.width = 640;
  this.height = 360;
  this.frame_len = 0;
  this.frame_info = [];
  this.num_frames = 0;
  this.frame_num = 0;

  this.open = function(file, callback, width, height, pix_fmt, force_fmt) {
    this.file = file;
    this.file_fmt = this.file.name.toLowerCase().split('.').pop();
    if (this.file_fmt == 'y4m') {
      var self = this;
      this.read(0, 100, function() {
        var y4m = self.parse_y4m_header(self.data, 0);
        self.frame_info.push(y4m);
        // Header of frame #0 contains extra fiels such as width, height, etc.
        // Below assumes that starting from frame #1 size of header is constant.
        self.seek(1, function() {
          if (self.frame_info.length > 1) {
            var frame_info = self.frame_info[1];
            self.num_frames = Math.floor(
                (self.file.size - frame_info.pos) /
                    (frame_info.header_len + frame_info.frame_len) +
                1);
          }
          callback(self.num_frames > 0);
        });
      });
    } else {
      if (!force_fmt) {
        var m = file.name.toLowerCase().match(
            /[-_^]([\d]{1,4})x([\d]{1,4})[-_\.$]/);
        if (m) {
          width = m[1];
          height = m[2];
        } else {
          m = file.name.toLowerCase().match(/(1080|720|vga|qcif|cif)/);
          if (m) {
            const wxh = {
              '1080': [1920, 1080],
              '720': [1280, 720],
              'vga': [640, 480],
              'cif': [352, 288],
              'qcif': [176, 144]
            };
            width = wxh[m[1]][0];
            height = wxh[m[1]][1];
          }
        }

        m = file.name.toLowerCase().match(/[-_](yv12|nv12|yv16|yv24|gray)/);
        if (m) {
          pix_fmt = m[1] == '400' ? 'gray' : m[1];
        }
      }

      this.set_params(width, height, pix_fmt);

      this.num_frames = Math.floor(this.file.size / this.frame_len);
      callback(this.num_frames > 0);
    }
  };

  this.seek = function(frame_num, callback) {
    var self = this;
    if (this.file_fmt != 'y4m') {
      this.read(frame_num * this.frame_len, this.frame_len, function() {
        self.frame_num = frame_num;
        callback();
      });
    } else if (this.frame_info.length > frame_num) {
        var frame_info = this.frame_info[frame_num];
        const pos = frame_info.pos + frame_info.header_len;
        this.read(pos, frame_info.frame_len, function() {
          self.set_params(frame_info.w, frame_info.h, frame_info.c);
          self.frame_num = frame_num;
          callback();
        });
    } else if (this.frame_info.length > 0) {
        // Requested frame was not read before. Find last read frame and
        // step frame-by-frame to requested one reading only headers of frames
        // in between.
        var frame_info = this.frame_info[this.frame_info.length - 1];
        const pos = frame_info.pos + frame_info.header_len + frame_info.frame_len;
        this.read(pos, 100, function() {
          var y4m = self.parse_y4m_header(self.data, pos, frame_info.w, frame_info.h, frame_info.c);
          self.frame_info.push(y4m);
          setTimeout(function() {
            self.seek(frame_num, callback);
          }, 0);
        });
    }
  };

  this.yuv = function(py, px) {
    var y, u = 128, v = 128;
    y = this.data[py * this.width + px];
    if (this.pix_fmt != 'gray') {
      var chroma_pix_offset = (py >> this.chroma_vert_freq_log2) * this.chroma_line_sz +
          (px >> this.chroma_horz_freq_log2) * this.chroma_pix_sz;
      var chroma_u_pos = this.chroma_u_offset + chroma_pix_offset;
      var chroma_v_pos = this.chroma_v_offset + chroma_pix_offset;
      u = this.data[chroma_u_pos];
      v = this.data[chroma_v_pos];
    }
    return [y, u, v];
  };

  this.read = function(pos, bytes, callback) {
    if (this.file) {
      var self = this;
      var reader = new FileReader();
      reader.onloadend = function(evt) {
        if (evt.target.readyState == FileReader.DONE) {
          self.data = new Uint8Array(evt.target.result);
          callback();
        }
      };
      var blob = this.file.slice(pos, pos + bytes + 1);
      reader.readAsArrayBuffer(blob);
    }
  };

  this.parse_y4m_header = function(data, pos, def_w, def_h, def_c) {
    var header = '';
    var length = 0;
    var found_frame = false;
    while (length < data.length) {
      var byte = data[length++];
      if (header.length >= 5 && header.slice(header.length - 5) == 'FRAME') {
        found_frame = true;
      }
      if (byte == 0x0a) {
        if (found_frame) break;
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
  };

  this.set_params = function(width, height, pix_fmt) {
    this.width = width;
    this.height = height;
    this.chroma_horz_freq_log2 = 0;
    this.chroma_vert_freq_log2 = 0;
    this.chroma_line_sz = width;
    this.chroma_pix_sz = 1;
    this.frame_len = this.width * this.height;

    var map = {
      '400': 'gray',
      '420': 'yv12',
      '422': 'yv16',
      '444': 'yv24',
    };
    this.pix_fmt = pix_fmt in map ? map[pix_fmt] : pix_fmt;

    if (this.pix_fmt == 'yv24') {
      this.frame_len *= 3;
      this.chroma_u_offset = width * height;
      this.chroma_v_offset = width * height * 2;
    } else if (this.pix_fmt == 'yv16') {
      this.frame_len *= 2;
      this.chroma_horz_freq_log2 = 1;
      this.chroma_u_offset = width * height;
      this.chroma_v_offset = width * height + width * height / 2;
    } else if (this.pix_fmt == 'yv12') {
      this.frame_len *= 3;
      this.frame_len /= 2;
      this.chroma_horz_freq_log2 = 1;
      this.chroma_vert_freq_log2 = 1;
      this.chroma_u_offset = width * height;
      this.chroma_v_offset = width * height + width * height / 4;
    } else if (this.pix_fmt == 'nv12') {
      this.frame_len *= 3;
      this.frame_len /= 2;
      this.chroma_horz_freq_log2 = 1;
      this.chroma_vert_freq_log2 = 1;
      this.chroma_u_offset = width * height;
      this.chroma_v_offset = width * height + 1;
      this.chroma_pix_sz = 2;
    }

    this.chroma_line_sz = this.chroma_pix_sz * (this.width >> this.chroma_horz_freq_log2);
  };
};
