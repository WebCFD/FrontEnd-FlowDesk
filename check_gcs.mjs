import { Storage } from '@google-cloud/storage';

async function checkGCS() {
  try {
    const storage = new Storage();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    
    if (!bucketId) {
      console.log('❌ DEFAULT_OBJECT_STORAGE_BUCKET_ID not set');
      process.exit(1);
    }
    
    console.log(`📦 Bucket: ${bucketId}`);
    
    const bucket = storage.bucket(bucketId);
    const [files] = await bucket.getFiles({ prefix: '.private/vtk/' });
    
    console.log(`\n📁 Found ${files.length} files in .private/vtk/:`);
    
    if (files.length === 0) {
      console.log('   (empty - no VTK files uploaded yet)');
    } else {
      files.slice(0, 30).forEach(file => {
        const size = file.metadata?.size || 0;
        console.log(`   - ${file.name} (${(size/1024).toFixed(2)} KB)`);
      });
      if (files.length > 30) {
        console.log(`   ... and ${files.length - 30} more`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error.code);
    process.exit(1);
  }
}

checkGCS();
