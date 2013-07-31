require 'nokogiri'
require 'json/ext'
require 'csv'

@@frames = []
@@folder_name = 'final_data'
@@output_file = 'final_frames.json'
@@node_narratives = CSV.open('site_narratives.csv', 'r', {:headers => true})
@@frame_narratives = CSV.open('week_narratives_final.csv', 'r', {:headers => true})
@@min_position = [10000, 10000]
@@max_position = [-10000, -10000]

class MyDocument < Nokogiri::XML::SAX::Document
    def start_document
        @nodes = []
        @links = []
        @attributes = []
        @narrative = ''
        @start_date = ''
        @end_date = ''
        @boundaries = [10000, 10000, -10000, -10000]
        @size_range = [1000, -1000]
    end

    def end_document
        # Change links from node IDs to node indexes
        @links.map do |link|
            link['source'] = link['source']
            link['target'] = link['target']
            link
        end
        @@frames << {
            'nodes'      => @nodes,
            'links'      => @links,
            'boundaries' => @boundaries,
            'size_range' => @size_range
        }
    end

    def start_element name, attributes = []
        attributes = Hash[attributes]
        case name
        when 'attribute'
            @attributes << attributes
        when 'edge'
            @active_link = attributes.merge(attributes) { |key, value| value.to_i }
        when 'node'
            @active_node = {
                'id'    => attributes['id'].to_i,
                'label' => attributes['label'],
                'index' => @nodes.length
            }
        when 'attvalue'
            attr = @attributes.select { |attr| attr['id'] == attributes['for'] }.first
            key = attr['title']
            case attr['type']
            when 'integer'
                @active_node[key] = attributes['value'].to_i if @active_node
                @active_link[key] = attributes['value'].to_i if @active_link
            when 'float'
                @active_node[key] = attributes['value'].to_f if @active_node
                @active_link[key] = attributes['value'].to_f if @active_link
            else
                @active_node[key] = attributes['value'] if @active_node
                @active_link[key] = attributes['value'] if @active_link
            end
        when 'spell'
        when 'viz:color'
            @active_node['color'] = {
                'r' => attributes['r'].to_i, 
                'g' => attributes['g'].to_i, 
                'b' => attributes['b'].to_i
            }
        when 'viz:size'
            @active_node['size'] = attributes['value'].to_f
            @size_range[0] = attributes['value'].to_f if attributes['value'].to_f < @size_range[0]
            @size_range[1] = attributes['value'].to_f if attributes['value'].to_f > @size_range[1]
        when 'viz:position'
            @active_node['position'] = {
                'x' => attributes['x'].to_f,
                'y' => attributes['y'].to_f
            }
            @boundaries[0] = attributes['x'].to_f if attributes['x'].to_f < @boundaries[0]
            @boundaries[1] = attributes['y'].to_f if attributes['y'].to_f < @boundaries[1]
            @boundaries[2] = attributes['x'].to_f if attributes['x'].to_f > @boundaries[2]
            @boundaries[3] = attributes['y'].to_f if attributes['y'].to_f > @boundaries[3]
        end
    end

    def end_element name
        case name
        when 'node'
            @nodes << @active_node
            @active_node = nil
        when 'edge'
            @links << @active_link
            @active_link = nil
        end
    end
end

def dates(filename)
    filename[filename.index('2')...filename.index('.')].split('_')
end
# Create a new parser
parser = Nokogiri::XML::SAX::Parser.new(MyDocument.new)

filenames = Dir.entries(@@folder_name).reject! { |filename| filename[0] == '.' }.sort!

# Feed the parser some XML
#parser.parse(File.open('data/sopa_media_link_monthly_2010-10-02_2010-11-02.gexf'))
filenames.each do |filename|
    puts "#{@@folder_name}/#{filename}"
    parser.parse_file("#{@@folder_name}/#{filename}")
end

narrative_dates = @@frame_narratives.map{|fn| fn['week_start_date'].gsub('_', '-').strip}
@@frame_narratives.rewind
frame_dates = filenames.map{|f| dates(f)[0]}

puts "Narratives without frames: #{narrative_dates - frame_dates}"
puts "Frames without narratives: #{frame_dates - narrative_dates}"

@@frames.each_with_index do |frame, i|
    frame_dates = dates(filenames[i])
    frame['start_date'] = frame_dates[0]
    frame['end_date'] = frame_dates[1]
    fnr = @@frame_narratives.find do |fn|
        date = fn['week_start_date'].gsub('_', '-').strip
        date == frame['start_date']
    end
    frame['narrative'] = fnr['text'] if fnr
    frame['nodes'].each do |node|
        nnr = @@node_narratives.find do |nn|
            nn['week_start_date'].strip.gsub('_', '-') == frame['start_date'] && nn['url'] == node['url']
        end
        node['narrative'] = nnr['text'] if nnr
        @@node_narratives.rewind
    end
    @@frame_narratives.rewind
end
File.open(@@output_file, 'w') {|f| f.write(@@frames.to_json) }
