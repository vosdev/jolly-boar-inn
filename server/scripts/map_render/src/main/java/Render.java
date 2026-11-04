import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import javax.imageio.ImageIO;
import net.runelite.cache.MapImageDumper;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Region;
import net.runelite.cache.region.RegionLoader;
import net.runelite.cache.util.KeyProvider;
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

            // The dumper's own loader, so the regions are held once, not twice.
            RegionLoader regions = new SurfaceLoader(store, keys, minX, maxX, minY, maxY);
            MapImageDumper dumper = new MapImageDumper(store, regions);
            dumper.setRenderIcons(false);
            dumper.setRenderLabels(false);
            // Its disk-backed images are for the whole world at once, not a square at a time.
            dumper.setLowMemory(false);
            dumper.load();

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

    /**
     * Loads the squares in a range and the ring around it, not the whole cache.
     *
     * <p>The dungeons and instances north of the surface are most of the world's regions, and
     * holding them all needs more memory than a small server has. The ring is there because a
     * square's edge blends into its neighbours' ground and shows their objects that overhang it.
     */
    private static final class SurfaceLoader extends RegionLoader {
        private final int minX;
        private final int maxX;
        private final int minY;
        private final int maxY;

        SurfaceLoader(Store store, KeyProvider keys, int minX, int maxX, int minY, int maxY) {
            super(store, keys);
            this.minX = minX - 1;
            this.maxX = maxX + 1;
            this.minY = minY - 1;
            this.maxY = maxY + 1;
        }

        @Override
        public void loadRegions() {
            for (int x = minX; x <= maxX; x++) {
                for (int y = minY; y <= maxY; y++) {
                    try {
                        loadRegionFromArchive(x << 8 | y);
                    } catch (IOException exc) {
                        // As RegionLoader does: a square the cache cannot read is left out.
                    }
                }
            }
        }
    }
}
