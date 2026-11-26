import java.awt.image.BufferedImage;
import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.TreeSet;
import javax.imageio.ImageIO;
import net.runelite.cache.AreaManager;
import net.runelite.cache.FontManager;
import net.runelite.cache.FontName;
import net.runelite.cache.SpriteManager;
import net.runelite.cache.WorldMapManager;
import net.runelite.cache.definitions.AreaDefinition;
import net.runelite.cache.definitions.FontDefinition;
import net.runelite.cache.definitions.SpriteDefinition;
import net.runelite.cache.definitions.WorldMapElementDefinition;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Position;

/**
 * Writes the surface's map labels and the fonts that draw them to {@code <out>/labels.json},
 * and each glyph they use to {@code <out>/<size>_<char>.png}, as {@code MapImageDumper} draws
 * them: a label's size picks one of three fonts, and its colour fills the glyph.
 */
public final class Labels {
    private static final int SQUARE = 64;
    private static final FontName[] SIZES = {
        FontName.VERDANA_11, FontName.VERDANA_13, FontName.VERDANA_15
    };

    private Labels() {}

    /** Arguments: cache folder, output folder, lowest x, highest x, lowest y, highest y. */
    public static void main(String[] args) throws Exception {
        File out = new File(args[1]);
        int minX = Integer.parseInt(args[2]);
        int maxX = Integer.parseInt(args[3]);
        int minY = Integer.parseInt(args[4]);
        int maxY = Integer.parseInt(args[5]);

        try (Store store = new Store(new File(args[0]))) {
            store.load();
            AreaManager areas = new AreaManager(store);
            areas.load();
            WorldMapManager worldMap = new WorldMapManager(store);
            worldMap.load();
            FontManager fonts = new FontManager(store);
            fonts.load();
            SpriteManager sprites = new SpriteManager(store);
            sprites.load();

            @SuppressWarnings("unchecked")
            TreeSet<Integer>[] used = new TreeSet[SIZES.length];
            for (int size = 0; size < SIZES.length; size++) {
                used[size] = new TreeSet<>();
            }
            StringBuilder labels = new StringBuilder();
            for (WorldMapElementDefinition element : worldMap.getElements()) {
                AreaDefinition area = areas.getArea(element.getAreaDefinitionId());
                Position at = element.getWorldPosition();
                int squareX = at.getX() / SQUARE;
                int squareY = at.getY() / SQUARE;
                if (area == null || area.getName() == null || at.getZ() != 0
                        || squareX < minX || squareX > maxX || squareY < minY || squareY > maxY) {
                    continue;
                }
                int size = area.getTextScale();
                for (char c : area.getName().replace("<br>", "").toCharArray()) {
                    used[size].add((int) c);
                }
                labels.append(labels.length() == 0 ? "" : ",")
                        .append('[').append(at.getX()).append(',').append(at.getY()).append(',')
                        .append(size).append(',').append(area.getTextColor() & 0xFFFFFF).append(',')
                        .append(quoted(area.getName())).append(']');
            }

            StringBuilder sizes = new StringBuilder();
            for (int size = 0; size < SIZES.length; size++) {
                String name = SIZES[size].getName();
                FontDefinition font = fonts.findFontByName(name);
                StringBuilder glyphs = new StringBuilder();
                for (int c : used[size]) {
                    SpriteDefinition glyph = sprites.findSpriteByArchiveName(name, c);
                    if (glyph.getWidth() == 0 || glyph.getHeight() == 0) {
                        continue;
                    }
                    ImageIO.write(image(glyph), "png", new File(out, size + "_" + c + ".png"));
                    glyphs.append(glyphs.length() == 0 ? "" : ",")
                            .append('"').append(c).append("\":[").append(glyph.getOffsetX())
                            .append(',').append(glyph.getOffsetY()).append(']');
                }
                StringBuilder advances = new StringBuilder();
                for (int advance : font.getAdvances()) {
                    advances.append(advances.length() == 0 ? "" : ",").append(advance);
                }
                sizes.append(sizes.length() == 0 ? "" : ",")
                        .append("{\"ascent\":").append(font.getAscent())
                        .append(",\"advances\":[").append(advances)
                        .append("],\"glyphs\":{").append(glyphs).append("}}");
            }

            try (PrintWriter file = new PrintWriter(new File(out, "labels.json"), StandardCharsets.UTF_8)) {
                file.write("{\"fonts\":[" + sizes + "],\"labels\":[" + labels + "]}\n");
            }
        }
    }

    /** A glyph in white on clear, for the browser to colour. */
    private static BufferedImage image(SpriteDefinition glyph) {
        BufferedImage image = new BufferedImage(
                glyph.getWidth(), glyph.getHeight(), BufferedImage.TYPE_INT_ARGB);
        int[] pixels = glyph.getPixels();
        for (int y = 0; y < glyph.getHeight(); y++) {
            for (int x = 0; x < glyph.getWidth(); x++) {
                if (pixels[x + y * glyph.getWidth()] != 0) {
                    image.setRGB(x, y, 0xFFFFFFFF);
                }
            }
        }
        return image;
    }

    private static String quoted(String text) {
        StringBuilder json = new StringBuilder("\"");
        for (char c : text.toCharArray()) {
            if (c == '"' || c == '\\') {
                json.append('\\').append(c);
            } else if (c < 0x20) {
                json.append(String.format("\\u%04x", (int) c));
            } else {
                json.append(c);
            }
        }
        return json.append('"').toString();
    }
}
