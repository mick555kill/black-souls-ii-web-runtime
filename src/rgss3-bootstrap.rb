# RGSS3-compatible API subset for Ruby 3.2 WebAssembly.
# Browser rendering and input are delegated to JavaScript; not full RGSS3.
require 'js'

module RGSSWeb
  def self.host
    JS.global[:__VXRGSS3]
  end
end

class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, width = 0, height = 0)
    set(x, y, width, height)
  end
  def set(x, y = nil, width = nil, height = nil)
    if x.is_a?(Rect)
      y,width,height=x.y,x.width,x.height
      x=x.x
    end
    @x, @y, @width, @height = x.to_i, y.to_i, width.to_i, height.to_i
    self
  end
  def empty
    set(0, 0, 0, 0)
  end
end

class Color
  attr_accessor :red, :green, :blue, :alpha
  def initialize(red = 0, green = 0, blue = 0, alpha = 255)
    set(red, green, blue, alpha)
  end
  def set(red, green = nil, blue = nil, alpha = 255)
    if red.is_a?(Color)
      green,blue,alpha=red.green,red.blue,red.alpha
      red=red.red
    end
    @red, @green, @blue, @alpha = red.to_f, green.to_f, blue.to_f, alpha.to_f
    self
  end
  def css
    "rgba(#{@red.to_i.clamp(0,255)},#{@green.to_i.clamp(0,255)},#{@blue.to_i.clamp(0,255)},#{(@alpha / 255.0).clamp(0,1)})"
  end
end

class Tone
  attr_accessor :red, :green, :blue, :gray
  def initialize(red = 0, green = 0, blue = 0, gray = 0)
    set(red, green, blue, gray)
  end
  def set(red, green = nil, blue = nil, gray = 0)
    if red.is_a?(Tone)
      green,blue,gray=red.green,red.blue,red.gray
      red=red.red
    end
    @red, @green, @blue, @gray = red.to_f, green.to_f, blue.to_f, gray.to_f
    self
  end
end

class Font
  class << self
    attr_accessor :default_name, :default_size, :default_bold, :default_italic,
                  :default_shadow, :default_outline, :default_color,
                  :default_out_color
  end
  self.default_name = 'Arial'
  self.default_size = 24
  self.default_bold = false
  self.default_italic = false
  self.default_shadow = false
  self.default_outline = true
  self.default_color = Color.new(255,255,255)
  self.default_out_color = Color.new(0,0,0,128)

  attr_accessor :name, :size, :bold, :italic, :shadow, :outline, :color, :out_color
  def initialize(name = nil, size = nil)
    @name = name || Font.default_name
    @size = size || Font.default_size
    @bold = Font.default_bold
    @italic = Font.default_italic
    @shadow = Font.default_shadow
    @outline = Font.default_outline
    @color = Font.default_color
    @out_color = Font.default_out_color
  end
end

module Graphics
  @width = 544
  @height = 416
  @frame_rate = 60
  @frame_count = 0
  class << self
    attr_accessor :frame_rate, :frame_count
    attr_reader :width, :height
  end
  def self.update
    @frame_count += 1
    RGSSWeb.host.frame.await
    nil
  end
  def self.wait(duration)
    duration.to_i.times { update }
  end
  def self.resize_screen(width, height)
    @width, @height = width.to_i, height.to_i
    RGSSWeb.host.resize(@width, @height)
    nil
  end
  def self.fadeout(duration)
    RGSSWeb.host.fade(1, duration.to_i)
    wait(duration)
  end
  def self.fadein(duration)
    RGSSWeb.host.fade(0, duration.to_i)
    wait(duration)
  end
  def self.freeze; nil; end
  def self.transition(duration = 10, filename = '', vague = 40)
    wait(duration)
  end
  def self.snap_to_bitmap
    Bitmap.new(@width,@height)
  end
  # RGSS3 feature detection in game plugins checks for this method.
  # Movie playback will need a separate browser video implementation.
  def self.play_movie(filename)
    raise NotImplementedError, "RGSS3 browser movie playback is not implemented: #{filename}"
  end
end

module Input
  DOWN = :DOWN; LEFT = :LEFT; RIGHT = :RIGHT; UP = :UP
  A = :A; B = :B; C = :C; X = :X; Y = :Y; Z = :Z; L = :L; R = :R
  SHIFT = :SHIFT; CTRL = :CTRL; ALT = :ALT
  F5 = :F5; F6 = :F6; F7 = :F7; F8 = :F8; F9 = :F9
  def self.update
    RGSSWeb.host.inputUpdate
    nil
  end
  def self.press?(key)
    RGSSWeb.host.inputPress(key.to_s).to_s == 'true'
  end
  def self.trigger?(key)
    RGSSWeb.host.inputTrigger(key.to_s).to_s == 'true'
  end
  def self.repeat?(key)
    RGSSWeb.host.inputRepeat(key.to_s).to_s == 'true'
  end
  def self.dir4
    RGSSWeb.host.inputDir4.to_i
  end
  def self.dir8
    dir4
  end
end

module Audio
  def self.bgm_play(name, volume = 100, pitch = 100, pos = 0)
    RGSSWeb.host.audio('bgm', 'play', name.to_s, volume.to_i, pitch.to_i, pos.to_i)
    nil
  end
  def self.bgm_stop; RGSSWeb.host.audio('bgm', 'stop', '', 0, 0, 0); end
  def self.bgm_fade(time); RGSSWeb.host.audio('bgm', 'fade', '', time.to_i, 0, 0); end
  def self.bgm_pos; 0; end
  def self.bgs_play(name, volume = 100, pitch = 100, pos = 0)
    RGSSWeb.host.audio('bgs','play',name.to_s,volume.to_i,pitch.to_i,pos.to_i)
  end
  def self.bgs_stop; RGSSWeb.host.audio('bgs','stop','',0,0,0); end
  def self.bgs_fade(time); RGSSWeb.host.audio('bgs','fade','',time.to_i,0,0); end
  def self.bgs_pos; 0; end
  def self.me_play(name, volume = 100, pitch = 100)
    RGSSWeb.host.audio('me','play',name.to_s,volume.to_i,pitch.to_i,0)
  end
  def self.me_stop; RGSSWeb.host.audio('me','stop','',0,0,0); end
  def self.me_fade(time); RGSSWeb.host.audio('me','fade','',time.to_i,0,0); end
  def self.se_play(name, volume = 100, pitch = 100)
    RGSSWeb.host.audio('se','play',name.to_s,volume.to_i,pitch.to_i,0)
  end
  def self.se_stop; RGSSWeb.host.audio('se','stop','',0,0,0); end
end

# Steamworks cannot load a Windows DLL inside browser WebAssembly. Make this
# specific optional plugin safely report "not initialized" (0) instead of
# crashing while evaluating the game's script definitions. Other Win32 APIs
# remain intentionally unsupported.
class Win32API
  def initialize(dll, function, *signature)
    raise NotImplementedError, "Windows DLL access unavailable: #{dll}" unless
      /\Asteam_api(?:64)?\z/i.match?(dll.to_s)
    @function = function
  end
  def call(*args)
    0
  end
end

class Bitmap
  attr_reader :width, :height, :id
  attr_accessor :font
  def rect; Rect.new(0,0,@width,@height); end
  def initialize(width, height = nil)
    if width.is_a?(String)
      @width, @height = 544, 416 # Asset dimensions become known asynchronously on JS side.
      @id = RGSSWeb.host.bitmapLoad(width).to_i
    else
      @width, @height = width.to_i, height.to_i
      raise ArgumentError, 'invalid bitmap size' unless @width > 0 && @height > 0
      @id = RGSSWeb.host.bitmapCreate(@width, @height).to_i
    end
    @disposed = false
    @font = Font.new
  end
  def disposed?; @disposed; end
  def dispose
    return if @disposed
    RGSSWeb.host.bitmapDispose(@id)
    @disposed = true
  end
  def clear
    RGSSWeb.host.bitmapClear(@id)
  end
  def fill_rect(*args)
    if args.first.is_a?(Rect)
      r, color = args
      RGSSWeb.host.bitmapFill(@id, r.x,r.y,r.width,r.height,color.css)
    else
      x,y,w,h,color = args
      RGSSWeb.host.bitmapFill(@id,x.to_i,y.to_i,w.to_i,h.to_i,color.css)
    end
    nil
  end
  def gradient_fill_rect(*args)
    if args.first.is_a?(Rect)
      rect,color1,color2,vertical=args
      x,y,w,h=rect.x,rect.y,rect.width,rect.height
    else
      x,y,w,h,color1,color2,vertical=args
    end
    RGSSWeb.host.bitmapGradient(@id,x.to_i,y.to_i,w.to_i,h.to_i,
                                color1.css,color2.css,!!vertical)
    nil
  end
  def draw_text(*args)
    if args.first.is_a?(Rect)
      r, text, align = args
      x,y,w,h = r.x,r.y,r.width,r.height
    else
      x,y,w,h,text,align = args
    end
    RGSSWeb.host.bitmapText(@id,x.to_i,y.to_i,w.to_i,h.to_i,text.to_s,(align||0).to_i,
      @font.name.to_s,@font.size.to_i,@font.color.css)
    nil
  end
  def text_size(text)
    Rect.new(0,0,text.to_s.length * (@font.size * 0.6).round,@font.size)
  end
  def get_pixel(x,y)
    # RGSS expects synchronous pixel access; JS canvas readback is async from
    # WebAssembly's perspective. Default the Window skin's foreground to white.
    Color.new(255,255,255)
  end
  def blt(x,y,source,rect,opacity = 255)
    RGSSWeb.host.bitmapBlt(@id,x.to_i,y.to_i,source.id,rect.x,rect.y,rect.width,rect.height,opacity.to_i)
  end
  def stretch_blt(rect,source,source_rect,opacity = 255)
    RGSSWeb.host.bitmapStretchBlt(@id,rect.x,rect.y,rect.width,rect.height,source.id,
      source_rect.x,source_rect.y,source_rect.width,source_rect.height,opacity.to_i)
  end
end

class Sprite
  attr_reader :id, :bitmap, :x, :y, :z, :visible, :opacity, :zoom_x, :zoom_y, :ox, :oy
  attr_accessor :src_rect, :angle, :mirror, :tone, :color, :blend_type,
                :bush_depth, :wave_amp, :wave_length, :wave_speed, :wave_phase
  def initialize(viewport = nil)
    @id = RGSSWeb.host.spriteCreate.to_i
    @bitmap = nil
    @src_rect = Rect.new
    @ox = @oy = @angle = 0
    @zoom_x = @zoom_y = 1.0
    @tone = Tone.new
    @color = Color.new(0,0,0,0)
    self.x=0; self.y=0; self.z=0; self.visible=true; self.opacity=255
  end
  def bitmap=(value)
    @bitmap = value
    RGSSWeb.host.spriteSet(@id,'bitmap',value ? value.id : -1)
  end
  %i[x y z opacity zoom_x zoom_y visible ox oy].each do |prop|
    define_method("#{prop}=") do |value|
      instance_variable_set("@#{prop}",value)
      RGSSWeb.host.spriteSet(@id,prop.to_s,value)
    end
  end
  def update; nil; end
  def dispose; RGSSWeb.host.spriteDispose(@id) unless @disposed; @disposed=true; end
  def disposed?; !!@disposed; end
  def width; @bitmap ? @bitmap.width : 0; end
  def height; @bitmap ? @bitmap.height : 0; end
end

class Viewport
  attr_accessor :rect,:ox,:oy,:z,:visible,:tone,:color
  def initialize(*args)
    @rect = args.first.is_a?(Rect) ? args.first : Rect.new(*args)
    @ox=@oy=@z=0; @visible=true; @tone=Tone.new;@color=Color.new
  end
  def dispose; nil; end
  def update; nil; end
end

class Plane < Sprite; end

class Window < Sprite
  attr_accessor :padding,:padding_bottom,:active,
                :contents_opacity,:windowskin,:cursor_rect,:arrows_visible,:pause
  attr_reader :width,:height,:openness,:contents
  def initialize(x = 0, y = 0, width = 0, height = 0)
    super(nil)
    self.x=x;self.y=y;self.width=width;self.height=height
    @padding=12;@padding_bottom=12;self.openness=255;@active=true
    @contents_opacity=255;@cursor_rect=Rect.new;@arrows_visible=true;@pause=false
    RGSSWeb.host.spriteSet(@id,'window',true)
    self.contents=Bitmap.new(1,1)
  end
  def width=(value);@width=value.to_i;RGSSWeb.host.spriteSet(@id,'windowWidth',@width);end
  def height=(value);@height=value.to_i;RGSSWeb.host.spriteSet(@id,'windowHeight',@height);end
  def openness=(value);@openness=value.to_i.clamp(0,255);RGSSWeb.host.spriteSet(@id,'windowOpenness',@openness);end
  def contents=(bitmap);@contents=bitmap;self.bitmap=bitmap;end
  def open?; @openness >= 255; end
  def close?; @openness <= 0; end
  def move(x,y,w,h);self.x=x;self.y=y;self.width=w;self.height=h;end
end

class Table
  attr_reader :xsize,:ysize,:zsize
  def initialize(xsize, ysize=1, zsize=1)
    resize(xsize,ysize,zsize)
  end
  def resize(xsize,ysize=1,zsize=1)
    @xsize,@ysize,@zsize=xsize.to_i,ysize.to_i,zsize.to_i
    @dimensions = @zsize > 1 ? 3 : (@ysize > 1 ? 2 : 1)
    @cells=Array.new(@xsize*@ysize*@zsize,0)
  end
  def [](*xyz)
    x,y,z=xyz
    @cells[(x||0)+@xsize*((y||0)+@ysize*(z||0))]||0
  end
  def []=(*args)
    v=args.pop
    x,y,z=args
    @cells[(x||0)+@xsize*((y||0)+@ysize*(z||0))]=v.to_i
  end
end

true
