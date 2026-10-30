# VX Ace database object model for CRuby/WASM.
# Native Ruby Marshal.load constructs real RPG::* instances. This is a data
# compatibility layer, not the scene/game logic or the full RGSS3 API.
require 'base64'

module RPG
  class DataObject
    # RGSS data objects are saved using @instance_variables. Provide ordinary
    # field access without hardcoding every field added by a game's database.
    def method_missing(method_name, *args, &block)
      field = method_name.to_s
      if field.end_with?('=') && args.length == 1
        instance_variable_set("@#{field[0...-1]}", args.first)
      elsif args.empty? && instance_variable_defined?("@#{field}")
        instance_variable_get("@#{field}")
      else
        super
      end
    end
    def respond_to_missing?(method_name, include_private = false)
      field = method_name.to_s
      field.end_with?('=') || instance_variable_defined?("@#{field}") || super
    end
  end

  class BaseItem < DataObject
    class Feature < DataObject; end
  end
  class UsableItem < BaseItem
    class Effect < DataObject; end
    class Damage < DataObject; end
  end
  class EquipItem < BaseItem; end
  class Actor < BaseItem; end
  class Class < BaseItem
    class Learning < DataObject; end
  end
  class Skill < UsableItem
    class Damage < DataObject; end
  end
  class Item < UsableItem; end
  class Weapon < EquipItem; end
  class Armor < EquipItem; end
  class Enemy < BaseItem
    class Action < DataObject; end
    class DropItem < DataObject; end
  end
  class State < BaseItem; end
  class Troop < DataObject
    class Member < DataObject; end
    class Page < DataObject
      class Condition < DataObject; end
    end
  end
  class Animation < DataObject
    class Frame < DataObject; end
    class Timing < DataObject; end
  end
  class Tileset < DataObject; end
  class CommonEvent < DataObject; end
  class System < DataObject
    class Vehicle < DataObject; end
    class Terms < DataObject; end
    class TestBattler < DataObject; end
  end
  class MapInfo < DataObject; end
  class Map < DataObject
    class Encounter < DataObject; end
  end
  class Event < DataObject
    class Page < DataObject
      class Condition < DataObject; end
      class Graphic < DataObject; end
    end
  end
  class EventCommand < DataObject; end
  class MoveRoute < DataObject; end
  class MoveCommand < DataObject; end
  class AudioFile < DataObject; end
  class BGM < AudioFile; end
  class BGS < AudioFile; end
  class ME < AudioFile; end
  class SE < AudioFile; end
end

# VX Ace's Table is serialized with Marshal type 'u': 5 little-endian 32-bit
# integers followed by signed 16-bit cells in x-fastest order.
class Table
  def self._load(raw)
    raise ArgumentError, 'Invalid Table header' if raw.bytesize < 20
    dims, xs, ys, zs, count = raw.unpack('l<5')
    raise ArgumentError, 'Invalid Table dimensions' unless (1..3).cover?(dims)
    # RGSS3 may serialize empty tables (e.g. 0x0x1) with no cells.
    raise ArgumentError, 'Invalid Table size' unless xs >= 0 && ys >= 0 && zs >= 0
    raise ArgumentError, 'Table too large' if count < 0 || count > 20_000_000
    raise ArgumentError, 'Table data length mismatch' unless count == xs * ys * zs && raw.bytesize == 20 + count * 2
    obj = allocate
    obj.instance_variable_set(:@xsize, xs)
    obj.instance_variable_set(:@ysize, ys)
    obj.instance_variable_set(:@zsize, zs)
    obj.instance_variable_set(:@dimensions, dims)
    obj.instance_variable_set(:@cells, raw.byteslice(20, count * 2).unpack('s<*'))
    obj
  end
  def _dump(_level)
    [@dimensions, @xsize, @ysize, @zsize, @cells.length].pack('l<5') + @cells.pack('s<*')
  end
  def [](*args)
    x, y, z = args.map(&:to_i)
    y ||= 0; z ||= 0
    return nil if x.nil? || x < 0 || y < 0 || z < 0 || x >= @xsize || y >= @ysize || z >= @zsize
    @cells[x + @xsize * (y + @ysize * z)]
  end
  def []=(*args)
    value = args.pop.to_i
    x, y, z = args.map(&:to_i)
    y ||= 0; z ||= 0
    return if x.nil? || x < 0 || y < 0 || z < 0 || x >= @xsize || y >= @ysize || z >= @zsize
    @cells[x + @xsize * (y + @ysize * z)] = [value, 32767].min.clamp(-32768,32767)
  end
end

class Color
  def self._load(raw)
    raise ArgumentError, 'Color data length must be 32 bytes' unless raw.bytesize == 32
    new(*raw.unpack('E4'))
  end
  def _dump(_level)
    [red, green, blue, alpha].pack('E4')
  end
end

class Tone
  def self._load(raw)
    raise ArgumentError, 'Tone data length must be 32 bytes' unless raw.bytesize == 32
    new(*raw.unpack('E4'))
  end
  def _dump(_level)
    [red, green, blue, gray].pack('E4')
  end
end

class Rect
  def self._load(raw)
    raise ArgumentError, 'Rect data length must be 16 bytes' unless raw.bytesize == 16
    new(*raw.unpack('l<4'))
  end
  def _dump(_level)
    [x, y, width, height].pack('l<4')
  end
end

module RGSSWeb
  DATASETS = %w[Actors Classes Skills Items Weapons Armors Enemies Troops
                States Animations Tilesets CommonEvents System MapInfos Scripts].freeze
  @database = {}

  def self.clear_game_data
    @database = {}
    $data_actors = $data_classes = $data_skills = $data_items = nil
    $data_weapons = $data_armors = $data_enemies = $data_troops = nil
    $data_states = $data_animations = $data_tilesets = nil
    $data_common_events = $data_system = $data_mapinfos = $data_map = nil
    nil
  end

  def self.load_game_data
    name = host[:gameDataName].to_s
    valid = DATASETS.include?(name) || /\AMap\d{3}\z/.match?(name)
    raise ArgumentError, 'Unsupported VX Ace database name' unless valid
    encoded = host[:gameData64].to_s
    raise ArgumentError, 'Database file is too large' if encoded.bytesize > 90_000_000
    object = Marshal.load(Base64.strict_decode64(encoded))
    @database["data/#{name.downcase}.rvdata2"] = object
    case name
    when 'Actors' then $data_actors = object
    when 'Classes' then $data_classes = object
    when 'Skills' then $data_skills = object
    when 'Items' then $data_items = object
    when 'Weapons' then $data_weapons = object
    when 'Armors' then $data_armors = object
    when 'Enemies' then $data_enemies = object
    when 'Troops' then $data_troops = object
    when 'States' then $data_states = object
    when 'Animations' then $data_animations = object
    when 'Tilesets' then $data_tilesets = object
    when 'CommonEvents' then $data_common_events = object
    when 'System' then $data_system = object
    when 'MapInfos' then $data_mapinfos = object
    when /\AMap\d{3}\z/ then $data_map = object
    end
    "#{name}: #{object.class} (#{object.respond_to?(:size) ? object.size : 1})"
  end

  def self.get_data(path)
    normalized = path.to_s.tr('\\', '/').sub(/\A\.\//, '').downcase
    return @database[normalized] if @database.key?(normalized)
    raise IOError, "Database file not loaded into Ruby: #{path}"
  end
end

# DataManager in RPG Maker VX Ace uses this Kernel method to access rvdata2.
# Game assets are explicitly loaded by the browser before this method can work.
module Kernel
  def load_data(filename)
    RGSSWeb.get_data(filename)
  end
end

RGSSWeb.clear_game_data
true
