import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import javax.imageio.ImageIO;
import net.runelite.cache.AreaManager;
import net.runelite.cache.ObjectManager;
import net.runelite.cache.SpriteManager;
import net.runelite.cache.WorldMapManager;
import net.runelite.cache.definitions.AreaDefinition;
import net.runelite.cache.definitions.ObjectDefinition;
import net.runelite.cache.definitions.SpriteDefinition;
import net.runelite.cache.definitions.WorldMapElementDefinition;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Location;
import net.runelite.cache.region.Position;
import net.runelite.cache.region.Region;
import net.runelite.cache.region.RegionLoader;
import net.runelite.cache.util.XteaKeyManager;

/**
 * Writes the surface's map icons to {@code <out>/icons.json} and each sprite they use to
 * {@code <out>/<sprite>.png}, as the wiki's {@code MapExport} gathers them.
 */
public final class Icons {
    private static final int SQUARE = 64;

    private Icons() {}

    /** Arguments: cache folder, output folder, lowest x, highest x, lowest y, highest y. */
    public static void main(String[] args) throws Exception {
        File out = new File(args[1]);
        int minX = Integer.parseInt(args[2]);
        int maxX = Integer.parseInt(args[3]);
        int minY = Integer.parseInt(args[4]);
        int maxY = Integer.parseInt(args[5]);

        try (Store store = new Store(new File(args[0]))) {
            store.load();
            XteaKeyManager keys = new XteaKeyManager();
            keys.loadKeys(new ByteArrayInputStream("[]".getBytes()));
            RegionLoader regions = new RegionLoader(store, keys);
            ObjectManager objects = new ObjectManager(store);
            objects.load();
            AreaManager areas = new AreaManager(store);
            areas.load();
            WorldMapManager worldMap = new WorldMapManager(store);
            worldMap.load();
            SpriteManager sprites = new SpriteManager(store);
            sprites.load();

            List<int[]> icons = new ArrayList<>();
            for (int x = minX; x <= maxX; x++) {
                for (int y = minY; y <= maxY; y++) {
                    Region region = regions.loadRegionFromArchive(x << 8 | y);
                    if (region == null) {
                        continue;
                    }
                    // Every plane's icons, as the wiki draws them on the surface.
                    for (Location location : region.getLocations()) {
                        ObjectDefinition object = objects.getObject(location.getId());
                        if (object != null && object.getMapAreaId() != -1) {
                            AreaDefinition area = areas.getArea(object.getMapAreaId());
                            if (area != null && area.spriteId != -1) {
                                icons.add(icon(location.getPosition(), area.spriteId));
                            }
                        }
                    }
                }
            }
            // Links between maps are not objects: the world map holds them.
            for (WorldMapElementDefinition element : worldMap.getElements()) {
                AreaDefinition area = areas.getArea(element.getAreaDefinitionId());
                Position at = element.getWorldPosition();
                int squareX = at.getX() / SQUARE;
                int squareY = at.getY() / SQUARE;
                if (area != null && area.spriteId != -1
                        && squareX >= minX && squareX <= maxX && squareY >= minY && squareY <= maxY) {
                    icons.add(icon(at, area.spriteId));
                }
            }

            TreeSet<Integer> used = new TreeSet<>();
            StringBuilder json = new StringBuilder("[");
            for (int[] icon : icons) {
                if (json.length() > 1) {
                    json.append(',');
                }
                json.append('[').append(icon[0]).append(',').append(icon[1]).append(',')
                        .append(icon[2]).append(']');
                used.add(icon[2]);
            }
            json.append("]\n");
            for (int id : used) {
                SpriteDefinition sprite = sprites.findSprite(id, 0);
                BufferedImage image = sprites.getSpriteImage(sprite);
                ImageIO.write(image, "png", new File(out, id + ".png"));
            }
            try (PrintWriter file = new PrintWriter(new File(out, "icons.json"), StandardCharsets.UTF_8)) {
                file.write(json.toString());
            }
        }
    }

    private static int[] icon(Position at, int sprite) {
        return new int[] {at.getX(), at.getY(), sprite};
    }
}
