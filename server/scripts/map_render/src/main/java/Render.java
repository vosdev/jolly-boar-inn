import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import javax.imageio.ImageIO;
import net.runelite.cache.MapImageDumper;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Region;
import net.runelite.cache.region.RegionLoader;
import net.runelite.cache.util.XteaKeyManager;

/** Writes plane 0 of each map square in a range to {@code <out>/<x>_<y>.png}. */
public final class Render {
    private Render() {}

    /** Arguments: cache folder, output folder, lowest x, highest x, lowest y, highest y. */
    public static void main(String[] args) throws Exception {
        File out = new File(args[1]);
        int minX = Integer.parseInt(args[2]);
        int maxX = Integer.parseInt(args[3]);
        int minY = Integer.parseInt(args[4]);
        int maxY = Integer.parseInt(args[5]);

        try (Store store = new Store(new File(args[0]))) {
            store.load();
            // OpenRS2 lists no keys for recent caches: their map squares are not encrypted.
            XteaKeyManager keys = new XteaKeyManager();
            keys.loadKeys(new ByteArrayInputStream("[]".getBytes()));

            MapImageDumper dumper = new MapImageDumper(store, keys);
            dumper.setRenderIcons(false);
            dumper.setRenderLabels(false);
            // Its disk-backed images are for the whole world at once, not a square at a time.
            dumper.setLowMemory(false);
            dumper.load();

            RegionLoader regions = new RegionLoader(store, keys);
            regions.loadRegions();
            for (Region region : regions.getRegions()) {
                int x = region.getRegionX();
                int y = region.getRegionY();
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    BufferedImage image = dumper.drawRegion(region, 0);
                    ImageIO.write(image, "png", new File(out, x + "_" + y + ".png"));
                }
            }
        }
    }
}
